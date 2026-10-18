import { decodeCString, readU16LE, writeU16LE } from './bytes';
import { Cmd } from './commands';
import {
  resolveDeviceProperties,
  type DeviceProperty,
  type UsbIdentity,
} from './deviceProperties';
import { CrcError, DeviceErrorResponse, ProtocolError, TimeoutError, UnhandledCommandError } from './errors';
import { CHUNK_SIZE, decodeFrame, encodeFrame } from './frame';
import { LIGHTING_MODE_OFFSET, LIGHTING_PARAMS_SIZE, PROFILE_COUNT } from './enums';
import type { HidTransport } from './transport';

export const DEFAULT_TIMEOUT_MS = 1500;
export const WRITE_TIMEOUT_MS = 4000;
const KEYBOARD_INFO_SIZE = 96;
const RGB_LED_CONFIG_SIZE = 128;
const LED_CONFIG_PAYLOAD_SIZE = 2;

export interface KeyboardInfo {
  deviceName: string;
  modelName: string;
  serialNumber: string;
}

export interface ActuationPoint {
  /** Press threshold in µm. */
  pointOn: number;
  /** Release threshold in µm. */
  pointOff: number;
}

export interface RgbLedConfig {
  enable: boolean;
  /** 0..255, as stored by the device. */
  brightness: number;
}

export interface DeviceIdentity {
  protocolVersion: number;
  firmwareVersion: string;
  keyboardInfo: KeyboardInfo;
  usb: UsbIdentity;
  /** Newest matching deviceProperty, or undefined for an unknown model. */
  property: DeviceProperty | undefined;
  /** All matching revisions (older → newer). */
  candidates: DeviceProperty[];
  /** True when revisions differ but bcdDevice could not be read (WebHID). */
  ambiguous: boolean;
}

export interface VerifyResult {
  ok: boolean;
  /** Flattened byte indexes that did not read back as written (first 64). */
  mismatches: number[];
}

export interface ActuationPointDump {
  profile: number;
  points: ActuationPoint[];
}

export interface Backup {
  format: 'unofficial-zenaim-util/backup';
  version: 1;
  createdAt: string;
  device: {
    deviceName: string;
    modelName: string;
    serialNumber: string;
    protocolVersion: number;
    firmwareVersion: string;
    vendorId: number;
    productId: number;
    bcdDevice?: number;
  };
  actuationEnable: boolean;
  actuationPoints: ActuationPointDump[];
  rgbLedConfig: RgbLedConfig;
  /** One 512-byte params block per profile. */
  lighting: number[][];
}

function chunkIndexes(size: number): Array<{ offset: number; size: number }> {
  const out: Array<{ offset: number; size: number }> = [];
  for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
    out.push({ offset, size: Math.min(CHUNK_SIZE, size - offset) });
  }
  return out;
}

/** The device is addressed with a 16-bit offset (docs/protocol.md §2.4). */
const MAX_BUFFER_OFFSET = 0xffff;

/**
 * Reject any access that would not fit the 16-bit wire offset. Masking the value
 * instead would silently redirect the access to an unrelated region.
 */
function assertBufferRange(offset: number, size: number): void {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(size) || size < 0) {
    throw new ProtocolError(`invalid buffer range: offset=${offset} size=${size}`);
  }
  const last = size > 0 ? offset + size - 1 : offset;
  if (last > MAX_BUFFER_OFFSET) {
    throw new ProtocolError(
      `buffer range ${offset}..${last} does not fit the 16-bit device offset space (max ${MAX_BUFFER_OFFSET})`,
    );
  }
}

/**
 * §2.3: buffer replies echo the offset and the size. A reply that echoes anything
 * else belongs to another request (e.g. a late reply from a previous chunk), so it
 * must not be accepted as this one's data.
 */
function assertBufferEcho(
  response: Uint8Array,
  expectedOffset: number,
  expectedSize: number,
  command: number,
): void {
  const echoedOffset = (response[1] ?? 0) | ((response[2] ?? 0) << 8);
  const echoedSize = response[3] ?? -1;
  if (echoedOffset !== expectedOffset || echoedSize !== expectedSize) {
    throw new ProtocolError(
      `buffer reply mismatch for 0x${command.toString(16).padStart(2, '0')}: ` +
        `echo ${echoedOffset}/${echoedSize}, expected ${expectedOffset}/${expectedSize}`,
    );
  }
}

/** Profile-scoped data only exists for the documented 0..PROFILE_COUNT-1 (§4.1). */
function assertProfile(profile: number): void {
  if (!Number.isInteger(profile) || profile < 0 || profile >= PROFILE_COUNT) {
    throw new ProtocolError(
      `profile ${profile} is outside the documented 0..${PROFILE_COUNT - 1} range`,
    );
  }
}

export function decodeActuationPoints(bytes: Uint8Array): ActuationPoint[] {
  const points: ActuationPoint[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    points.push({ pointOn: readU16LE(bytes, i), pointOff: readU16LE(bytes, i + 2) });
  }
  return points;
}

export function encodeActuationPoints(points: readonly ActuationPoint[]): Uint8Array {
  const out = new Uint8Array(points.length * 4);
  points.forEach((point, i) => {
    writeU16LE(out, i * 4, point.pointOn);
    writeU16LE(out, i * 4 + 2, point.pointOff);
  });
  return out;
}

export function readLightingMode(params: Uint8Array): number {
  return params[LIGHTING_MODE_OFFSET] ?? 0;
}

export function writeLightingMode(params: Uint8Array, mode: number): void {
  params[LIGHTING_MODE_OFFSET] = mode & 0xff;
}

/**
 * High level, one-command-at-a-time client for the ZENAIM KEYBOARD protocol.
 *
 * Every write path follows the safe sequence from docs/protocol.md §6.3:
 * read back after the write and compare; the caller decides whether to restore.
 */
export class ZaneimClient {
  private closed = false;

  constructor(readonly transport: HidTransport) {}

  /* ---------------------------------------------------------------- core */

  /** Send a command and wait for the matching response (§2.3). */
  private async request(
    command: number[],
    expect: number | null,
    timeoutMs: number,
  ): Promise<Uint8Array> {
    if (this.closed) throw new ProtocolError('client is closed');
    const frame = encodeFrame(command);
    await this.transport.send(frame);

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TimeoutError(
          `no response to command 0x${(command[0] ?? 0).toString(16).padStart(2, '0')}`,
        );
      }
      const report = await this.transport.receive(remaining);
      let decoded: Uint8Array;
      try {
        decoded = decodeFrame(report);
      } catch (error) {
        if (error instanceof CrcError) continue; // corrupt frame: keep waiting
        throw error;
      }
      const id = decoded[0];
      if (id === Cmd.Unhandled) throw new UnhandledCommandError(command[0] ?? 0);
      if (id === Cmd.Error) throw new DeviceErrorResponse(decoded[1] ?? 0);
      if (expect !== null && id !== expect) continue; // unrelated/stale report
      return decoded;
    }
  }

  /** GetBuffer: read `size` bytes from `offset` in 26-byte chunks (§2.4). */
  async getBuffer(
    command: number,
    offset: number,
    size: number,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Uint8Array> {
    assertBufferRange(offset, size);
    const out = new Uint8Array(size);
    for (const chunk of chunkIndexes(size)) {
      const absolute = offset + chunk.offset;
      const response = await this.request(
        [command, absolute & 0xff, (absolute >> 8) & 0xff, chunk.size, 0x00],
        command,
        timeoutMs,
      );
      assertBufferEcho(response, absolute, chunk.size, command);
      for (let i = 0; i < chunk.size; i++) out[chunk.offset + i] = response[4 + i] ?? 0;
    }
    return out;
  }

  /** SetBuffer: write `data` at `offset` in 26-byte chunks (§2.4). */
  async setBuffer(
    command: number,
    offset: number,
    data: Uint8Array,
    timeoutMs = WRITE_TIMEOUT_MS,
  ): Promise<void> {
    assertBufferRange(offset, data.length);
    for (const chunk of chunkIndexes(data.length)) {
      const absolute = offset + chunk.offset;
      const commandBytes = [command, absolute & 0xff, (absolute >> 8) & 0xff, chunk.size];
      for (let i = 0; i < chunk.size; i++) commandBytes.push(data[chunk.offset + i] ?? 0);
      const response = await this.request(commandBytes, command, timeoutMs);
      assertBufferEcho(response, absolute, chunk.size, command);
    }
  }

  /** Send a bare `[id]` (or `[id, args]`) command and check the echo. */
  async simple(command: number[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Uint8Array> {
    return this.request(command, command[0] ?? null, timeoutMs);
  }

  /* --------------------------------------------------------- §3.1 / §3.2 */

  async protocolVersionGet(): Promise<number> {
    const response = await this.simple([Cmd.ProtocolVersionGet]);
    return readU16LE(response, 1);
  }

  async firmwareVersionGet(): Promise<string> {
    const response = await this.simple([Cmd.FirmwareVersionGet]);
    return decodeCString(response.subarray(1, 31));
  }

  async keyboardInfoGet(): Promise<KeyboardInfo> {
    const buffer = await this.getBuffer(Cmd.KeyboardInfoGet, 0, KEYBOARD_INFO_SIZE, WRITE_TIMEOUT_MS);
    return {
      deviceName: decodeCString(buffer.subarray(0, 32)),
      modelName: decodeCString(buffer.subarray(32, 64)),
      serialNumber: decodeCString(buffer.subarray(64, 96)),
    };
  }

  /** Full connect sequence from §1.3. */
  async identify(): Promise<DeviceIdentity> {
    const protocolVersion = await this.protocolVersionGet();
    const firmwareVersion = await this.firmwareVersionGet();
    const keyboardInfo = await this.keyboardInfoGet();
    const usb: UsbIdentity = { ...this.transport.usb, modelName: keyboardInfo.modelName };
    const candidates = resolveDeviceProperties(usb);
    const property = candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
    return {
      protocolVersion,
      firmwareVersion,
      keyboardInfo,
      usb,
      property,
      candidates,
      ambiguous: candidates.length > 1 && usb.bcdDevice === undefined,
    };
  }

  /* ----------------------------------------------------- §3.3 actuation */

  async actuationEnableGet(): Promise<boolean> {
    const response = await this.simple([Cmd.ActuationEnableGet]);
    return (response[1] ?? 0) !== 0;
  }

  async actuationEnableSet(enable: boolean): Promise<void> {
    await this.simple([Cmd.ActuationEnableSet, enable ? 1 : 0]);
  }

  /* ------------------------------------------------- §3.4 actuation point */

  actuationPointBlockSize(property: DeviceProperty): number {
    return property.keyCount * 4;
  }

  async actuationPointsGet(profile: number, property: DeviceProperty): Promise<ActuationPoint[]> {
    assertProfile(profile);
    const size = this.actuationPointBlockSize(property);
    const buffer = await this.getBuffer(Cmd.ActuationPointAllGet, profile * size, size, WRITE_TIMEOUT_MS);
    return decodeActuationPoints(buffer);
  }

  async actuationPointsSet(profile: number, points: readonly ActuationPoint[], property: DeviceProperty): Promise<void> {
    assertProfile(profile);
    const size = this.actuationPointBlockSize(property);
    await this.setBuffer(
      Cmd.ActuationPointAllSet,
      profile * size,
      encodeActuationPoints(points),
      WRITE_TIMEOUT_MS,
    );
  }

  actuationPointApply(): Promise<Uint8Array> {
    return this.simple([Cmd.ActuationPointApply], WRITE_TIMEOUT_MS);
  }

  actuationPointSave(): Promise<Uint8Array> {
    return this.simple([Cmd.ActuationPointSave], WRITE_TIMEOUT_MS);
  }

  /**
   * AllSet → Apply → Save → verify (§6.1). Report the read-back comparison so
   * the caller can offer a restore when the device did not take the values.
   */
  async writeActuationPoints(
    profile: number,
    points: readonly ActuationPoint[],
    property: DeviceProperty,
  ): Promise<VerifyResult> {
    if (points.length !== property.keyCount) {
      throw new ProtocolError(
        `expected ${property.keyCount} actuation points, got ${points.length}`,
      );
    }
    await this.actuationPointsSet(profile, points, property);
    await this.actuationPointApply();
    await this.actuationPointSave();
    const readBack = await this.actuationPointsGet(profile, property);
    return compareActuationPoints(points, readBack);
  }

  /* ------------------------------------------------------ §3.10 lighting */

  async lightingGet(profile: number): Promise<Uint8Array> {
    assertProfile(profile);
    return this.getBuffer(
      Cmd.RGBLightingGet,
      profile * LIGHTING_PARAMS_SIZE,
      LIGHTING_PARAMS_SIZE,
      WRITE_TIMEOUT_MS,
    );
  }

  async lightingSet(profile: number, params: Uint8Array): Promise<void> {
    assertProfile(profile);
    if (params.length !== LIGHTING_PARAMS_SIZE) {
      throw new ProtocolError(`lighting params must be ${LIGHTING_PARAMS_SIZE} bytes`);
    }
    await this.setBuffer(Cmd.RGBLightingSet, profile * LIGHTING_PARAMS_SIZE, params, WRITE_TIMEOUT_MS);
  }

  /** Set → Apply → Save → verify (§6.2). */
  async writeLighting(profile: number, params: Uint8Array): Promise<VerifyResult> {
    await this.lightingSet(profile, params);
    await this.simple([Cmd.RGBLightingApply], WRITE_TIMEOUT_MS);
    await this.simple([Cmd.RGBLightingSave], WRITE_TIMEOUT_MS);
    const readBack = await this.lightingGet(profile);
    return compareBytes(params, readBack);
  }

  /* ---------------------------------------------------- §3.14 RGB config */

  async rgbLedConfigGet(): Promise<RgbLedConfig> {
    const buffer = await this.getBuffer(
      Cmd.RGBLEDConfigGet,
      0,
      RGB_LED_CONFIG_SIZE,
      WRITE_TIMEOUT_MS,
    );
    return { enable: (buffer[0] ?? 0) !== 0, brightness: buffer[1] ?? 0 };
  }

  async rgbLedConfigSet(config: RgbLedConfig): Promise<void> {
    const payload = new Uint8Array(LED_CONFIG_PAYLOAD_SIZE);
    payload[0] = config.enable ? 1 : 0;
    payload[1] = config.brightness & 0xff;
    await this.setBuffer(Cmd.RGBLEDConfigSet, 0, payload, WRITE_TIMEOUT_MS);
  }

  /** Set → Apply → Save → verify (§6.2). */
  async writeRgbLedConfig(config: RgbLedConfig): Promise<VerifyResult> {
    await this.rgbLedConfigSet(config);
    await this.simple([Cmd.RGBLEDConfigApply], WRITE_TIMEOUT_MS);
    await this.simple([Cmd.RGBLEDConfigSave], WRITE_TIMEOUT_MS);
    const readBack = await this.rgbLedConfigGet();
    return {
      ok: readBack.enable === config.enable && readBack.brightness === config.brightness,
      mismatches:
        readBack.enable === config.enable && readBack.brightness === config.brightness ? [] : [0],
    };
  }

  /* ------------------------------------------------------- backup/restore */

  async makeBackup(identity: DeviceIdentity): Promise<Backup> {
    const property = identity.property;
    const actuationPoints: ActuationPointDump[] = [];
    if (property) {
      for (let profile = 0; profile < PROFILE_COUNT; profile++) {
        actuationPoints.push({ profile, points: await this.actuationPointsGet(profile, property) });
      }
    }
    const lighting: number[][] = [];
    for (let profile = 0; profile < PROFILE_COUNT; profile++) {
      lighting.push(Array.from(await this.lightingGet(profile)));
    }
    return {
      format: 'unofficial-zenaim-util/backup',
      version: 1,
      createdAt: new Date().toISOString(),
      device: {
        deviceName: identity.keyboardInfo.deviceName,
        modelName: identity.keyboardInfo.modelName,
        serialNumber: identity.keyboardInfo.serialNumber,
        protocolVersion: identity.protocolVersion,
        firmwareVersion: identity.firmwareVersion,
        vendorId: identity.usb.vendorId,
        productId: identity.usb.productId,
        ...(identity.usb.bcdDevice !== undefined ? { bcdDevice: identity.usb.bcdDevice } : {}),
      },
      actuationEnable: await this.actuationEnableGet(),
      actuationPoints,
      rgbLedConfig: await this.rgbLedConfigGet(),
      lighting,
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.transport.close();
  }
}

export function compareBytes(expected: Uint8Array, actual: Uint8Array, limit = 64): VerifyResult {
  const mismatches: number[] = [];
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length && mismatches.length < limit; i++) {
    if (expected[i] !== actual[i]) mismatches.push(i);
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function compareActuationPoints(
  expected: readonly ActuationPoint[],
  actual: readonly ActuationPoint[],
): VerifyResult {
  const mismatches: number[] = [];
  for (let i = 0; i < expected.length && mismatches.length < 64; i++) {
    const a = expected[i];
    const b = actual[i];
    if (!a || !b || a.pointOn !== b.pointOn || a.pointOff !== b.pointOff) mismatches.push(i);
  }
  return { ok: mismatches.length === 0, mismatches };
}
