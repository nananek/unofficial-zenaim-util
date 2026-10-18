import { encodeCString } from './bytes';
import { Cmd } from './commands';
import { ZENAIM_VENDOR_ID, type DeviceProperty } from './deviceProperties';
import { LIGHTING_PARAMS_SIZE, PROFILE_COUNT } from './enums';
import { encodeFrame, MAX_COMMAND_BYTES } from './frame';
import { TimeoutError } from './errors';
import { ReportQueue, type HidTransport } from './transport';

export interface MockDeviceOptions {
  protocolVersion?: number;
  firmwareVersion?: string;
  deviceName?: string;
  serialNumber?: string;
  /** Initial actuation points; defaults to the property's factory Normal values. */
  initialActuationPoint?: { pointOn: number; pointOff: number };
  actuationEnable?: boolean;
  rgbLedConfig?: { enable: boolean; brightness: number };
}

/**
 * In-memory emulation of a ZENAIM KEYBOARD, faithful to the write semantics in
 * docs/protocol.md §6: ActuationPointAllSet only stages values (AllGet does not
 * see them until Apply), whereas RGBLightingSet / RGBLEDConfigSet are visible
 * immediately.
 */
export class MockDevice {
  readonly property: DeviceProperty;
  readonly protocolVersion: number;
  readonly firmwareVersion: string;
  private readonly deviceName: string;
  private readonly serialNumber: string;

  private readonly apApplied: Uint8Array;
  private apStaged: Uint8Array;
  private apSaved: Uint8Array;
  readonly lighting: Uint8Array;
  readonly ledConfig = new Uint8Array(128);
  actuationEnable: boolean;
  profileSelect = 0;

  constructor(property: DeviceProperty, options: MockDeviceOptions = {}) {
    this.property = property;
    this.protocolVersion = options.protocolVersion ?? 2;
    this.firmwareVersion = options.firmwareVersion ?? '1.2.5';
    this.deviceName = options.deviceName ?? 'ZENAIM KEYBOARD';
    this.serialNumber = options.serialNumber ?? 'MOCK-0001';

    const initial = options.initialActuationPoint ?? property.initialNormal;
    const apSize = PROFILE_COUNT * property.keyCount * 4;
    this.apApplied = new Uint8Array(apSize);
    for (let i = 0; i < apSize; i += 4) {
      this.apApplied[i] = initial.pointOn & 0xff;
      this.apApplied[i + 1] = (initial.pointOn >> 8) & 0xff;
      this.apApplied[i + 2] = initial.pointOff & 0xff;
      this.apApplied[i + 3] = (initial.pointOff >> 8) & 0xff;
    }
    this.apStaged = this.apApplied.slice();
    this.apSaved = this.apApplied.slice();

    this.lighting = new Uint8Array(PROFILE_COUNT * LIGHTING_PARAMS_SIZE);
    this.ledConfig[0] = options.rgbLedConfig?.enable === false ? 0 : 1;
    this.ledConfig[1] = options.rgbLedConfig?.brightness ?? 128;
    this.actuationEnable = options.actuationEnable ?? true;
  }

  /** Values that survived a Save (used by tests to prove persistence). */
  get persistedActuationPoints(): Uint8Array {
    return this.apSaved.slice();
  }

  private keyboardInfoBuffer(): Uint8Array {
    const buffer = new Uint8Array(96);
    buffer.set(encodeCString(this.deviceName, 32), 0);
    buffer.set(encodeCString(this.property.modelName, 32), 32);
    buffer.set(encodeCString(this.serialNumber, 32), 64);
    return buffer;
  }

  private readBack(frame: Uint8Array, store: Uint8Array): number[] {
    const offset = (frame[1] ?? 0) | ((frame[2] ?? 0) << 8);
    const size = frame[3] ?? 0;
    const payload: number[] = [];
    for (let i = 0; i < size; i++) payload.push(store[offset + i] ?? 0);
    return [frame[0] ?? 0, offset & 0xff, (offset >> 8) & 0xff, size, ...payload];
  }

  private writeStore(frame: Uint8Array, store: Uint8Array): number[] {
    const offset = (frame[1] ?? 0) | ((frame[2] ?? 0) << 8);
    const size = frame[3] ?? 0;
    const payload: number[] = [];
    for (let i = 0; i < size; i++) {
      const value = frame[4 + i] ?? 0;
      store[offset + i] = value;
      payload.push(value);
    }
    return [frame[0] ?? 0, offset & 0xff, (offset >> 8) & 0xff, size, ...payload];
  }

  /** Turn one command frame into a response frame (without the CRC byte). */
  handle(frame: Uint8Array): number[] {
    const id = frame[0] ?? 0;
    switch (id) {
      case Cmd.ProtocolVersionGet:
        return [id, this.protocolVersion & 0xff, (this.protocolVersion >> 8) & 0xff];
      case Cmd.FirmwareVersionGet:
        return [id, ...encodeCString(this.firmwareVersion, 29)];
      case Cmd.KeyboardInfoGet:
        return this.readBack(frame, this.keyboardInfoBuffer());

      case Cmd.ActuationEnableGet:
        return [id, this.actuationEnable ? 1 : 0];
      case Cmd.ActuationEnableSet:
        this.actuationEnable = (frame[1] ?? 0) !== 0;
        return [id, frame[1] ?? 0];

      case Cmd.ActuationPointAllGet:
        return this.readBack(frame, this.apApplied);
      case Cmd.ActuationPointAllSet:
        return this.writeStore(frame, this.apStaged);
      case Cmd.ActuationPointApply:
        this.apStaged = this.apStaged.slice();
        this.apApplied.set(this.apStaged);
        return [id];
      case Cmd.ActuationPointSave:
        this.apSaved.set(this.apApplied);
        return [id];

      case Cmd.RGBLightingGet:
        return this.readBack(frame, this.lighting);
      case Cmd.RGBLightingSet:
        return this.writeStore(frame, this.lighting);
      case Cmd.RGBLightingApply:
      case Cmd.RGBLightingSave:
        return [id];

      case Cmd.RGBLEDConfigGet:
        return this.readBack(frame, this.ledConfig);
      case Cmd.RGBLEDConfigSet:
        return this.writeStore(frame, this.ledConfig);
      case Cmd.RGBLEDConfigApply:
      case Cmd.RGBLEDConfigSave:
        return [id];

      case Cmd.ProfileSelectGet:
        return [id, this.profileSelect];
      case Cmd.ProfileSelectSet:
        this.profileSelect = frame[1] ?? 0;
        return [id, this.profileSelect];

      default:
        return [Cmd.Unhandled];
    }
  }
}

export interface MockTransportOptions {
  /** Artificial response latency in ms (used by the browser demo mode). */
  latencyMs?: number;
  /** When true, the next `send` is swallowed to exercise timeout handling. */
  dropNext?: boolean;
  /** Report the given bcdDevice to the client (WebHID cannot). Defaults to the property's. */
  reportBcdDevice?: boolean;
}

/** `HidTransport` backed by a `MockDevice`, for tests and the browser demo mode. */
export class MockTransport implements HidTransport {
  readonly label: string;
  readonly usb;
  dropNext: boolean;
  latencyMs: number;
  private readonly queue = new ReportQueue();
  private readonly framesSent: Uint8Array[] = [];

  constructor(
    readonly device: MockDevice,
    options: MockTransportOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 0;
    this.dropNext = options.dropNext ?? false;
    this.label = this.latencyMs > 0 ? 'demo' : 'mock';
    this.usb = {
      vendorId: ZENAIM_VENDOR_ID,
      productId: device.property.productId,
      ...(options.reportBcdDevice === false ? {} : { bcdDevice: device.property.bcdDevice }),
    };
  }

  /** Frames the client sent, for assertions. */
  get sentFrames(): readonly Uint8Array[] {
    return this.framesSent;
  }

  async send(frame: Uint8Array): Promise<void> {
    if (frame.length !== MAX_COMMAND_BYTES + 1) {
      throw new Error(`mock received a ${frame.length}-byte frame`);
    }
    this.framesSent.push(frame.slice());
    if (this.dropNext) {
      this.dropNext = false;
      return;
    }
    const response = this.device.handle(frame);
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    this.queue.push(encodeFrame(response));
  }

  receive(timeoutMs: number): Promise<Uint8Array> {
    return this.queue.shift(timeoutMs, () => new TimeoutError('mock device did not respond'));
  }

  async close(): Promise<void> {
    this.queue.clear();
  }
}
