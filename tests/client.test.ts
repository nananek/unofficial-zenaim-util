import { describe, expect, it } from 'vitest';
import { Cmd } from '../src/lib/protocol/commands';
import { ZENAIM_VENDOR_ID, pickDeviceProperty } from '../src/lib/protocol/deviceProperties';
import { MockDevice, MockTransport } from '../src/lib/protocol/mockDevice';
import { ZaneimClient, parseActuationDepth, type ActuationPoint } from '../src/lib/protocol/client';
import {
  DeviceErrorResponse,
  ProtocolError,
  TimeoutError,
  UnhandledCommandError,
} from '../src/lib/protocol/errors';
import { encodeFrame, REPORT_SIZE } from '../src/lib/protocol/frame';
import { ReportQueue, type HidTransport } from '../src/lib/protocol/transport';
import { LIGHTING_PARAMS_SIZE, PROFILE_COUNT } from '../src/lib/protocol/enums';

const property80 = pickDeviceProperty({ vendorId: ZENAIM_VENDOR_ID, productId: 0x0003, bcdDevice: 0x0100 })!;

function setup(device = new MockDevice(property80)) {
  const transport = new MockTransport(device);
  const client = new ZaneimClient(transport);
  return { device, transport, client };
}

const samplePoints = (count: number): ActuationPoint[] =>
  Array.from({ length: count }, (_, i) => ({ pointOn: 1000 + i, pointOff: 900 + i }));

describe('ZaneimClient.identify', () => {
  it('runs the §1.3 connect sequence against the mock', async () => {
    const { client } = setup();
    const identity = await client.identify();
    expect(identity.protocolVersion).toBe(2);
    expect(identity.firmwareVersion).toBe('1.2.5');
    expect(identity.keyboardInfo.modelName).toBe('KB007-DGBK');
    expect(identity.property?.keyCount).toBe(108);
    expect(identity.ambiguous).toBe(false);
  });

  it('flags an unresolved revision when bcdDevice is hidden (WebHID)', async () => {
    const transport = new MockTransport(new MockDevice(property80), { reportBcdDevice: false });
    const client = new ZaneimClient(transport);
    const identity = await client.identify();
    expect(identity.usb.bcdDevice).toBeUndefined();
    expect(identity.property?.keyCount).toBe(108);
  });
});

describe('buffer transport', () => {
  it('reassembles a 96-byte multi-chunk read', async () => {
    const { client } = setup();
    const buffer = await client.getBuffer(Cmd.KeyboardInfoGet, 0, 96);
    expect(buffer).toHaveLength(96);
    expect(new TextDecoder().decode(buffer.subarray(0, 15))).toBe('ZENAIM KEYBOARD');
  });

  it('splits a 512-byte write into 26-byte chunks', async () => {
    const { client, transport } = setup();
    const params = new Uint8Array(LIGHTING_PARAMS_SIZE).fill(7);
    await client.lightingSet(0, params);
    // 512 bytes → ceil(512 / 26) = 20 commands.
    const setFrames = transport.sentFrames.filter((frame) => frame[0] === Cmd.RGBLightingSet);
    expect(setFrames).toHaveLength(20);
    for (const frame of setFrames) {
      const payloadSize = frame[3] ?? 0;
      expect(payloadSize).toBeGreaterThan(0);
      expect(payloadSize).toBeLessThanOrEqual(26);
      // command + offset(2) + size + payload must fit before the CRC byte.
      expect(4 + payloadSize).toBeLessThanOrEqual(31);
    }
  });
});

describe('actuation point write sequence (§6.1)', () => {
  it('does not reflect AllSet values until Apply', async () => {
    const { client } = setup();
    const points = samplePoints(property80.keyCount);
    await client.actuationPointsSet(0, points, property80);
    const beforeApply = await client.actuationPointsGet(0, property80);
    expect(beforeApply[0]).toEqual(property80.initialNormal);
    await client.actuationPointApply();
    const afterApply = await client.actuationPointsGet(0, property80);
    expect(afterApply[0]).toEqual(points[0]);
  });

  it('writes, applies, saves and verifies all 108 points', async () => {
    const { client, device } = setup();
    const points = samplePoints(property80.keyCount);
    const result = await client.writeActuationPoints(0, points, property80);
    expect(result).toEqual({ ok: true, mismatches: [] });

    const readBack = await client.actuationPointsGet(0, property80);
    expect(readBack).toEqual(points);
    // Save() persisted the applied values.
    expect(Array.from(device.persistedActuationPoints.subarray(0, 4))).toEqual([
      points[0]!.pointOn & 0xff,
      (points[0]!.pointOn >> 8) & 0xff,
      points[0]!.pointOff & 0xff,
      (points[0]!.pointOff >> 8) & 0xff,
    ]);
  });

  it('rejects a point array of the wrong length', async () => {
    const { client } = setup();
    await expect(client.writeActuationPoints(0, samplePoints(10), property80)).rejects.toThrow(
      ProtocolError,
    );
  });

  it('reports mismatches when the device does not take the values', async () => {
    class StubbornDevice extends MockDevice {
      override handle(frame: Uint8Array): number[] {
        // Accept the write and echo the header, but do not store it, so the
        // read-back keeps the old values.
        if (frame[0] === Cmd.ActuationPointAllSet) {
          const size = frame[3] ?? 0;
          return Array.from(frame.subarray(0, 4 + size));
        }
        return super.handle(frame);
      }
    }
    const transport = new MockTransport(new StubbornDevice(property80));
    const client = new ZaneimClient(transport);
    const result = await client.writeActuationPoints(0, samplePoints(property80.keyCount), property80);
    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('actuation depth samples (0xCB, read-only)', () => {
  it('parses the signed 14-bit distance and the switch bit', () => {
    // bit15 = sign, bit14 = switch state, bits13..0 = magnitude.
    expect(parseActuationDepth(0xe8, 0x03)).toEqual({ distance: 1000, switchState: false });
    expect(parseActuationDepth(0xc7, 0xbf)).toEqual({ distance: -57, switchState: false });
    expect(parseActuationDepth(0xf4, 0x41)).toEqual({ distance: 500, switchState: true });
    expect(parseActuationDepth(0x00, 0x00)).toEqual({ distance: 0, switchState: false });
    expect(parseActuationDepth(0xf2, 0x47)).toEqual({ distance: 2034, switchState: true });
    // Boundaries: magnitude spans 0..0x3FFF; with the sign bit set the value is
    // magnitude - 0x4000 (-0x4000..-1).
    expect(parseActuationDepth(0xff, 0x3f)).toEqual({ distance: 16383, switchState: false });
    expect(parseActuationDepth(0x00, 0x80)).toEqual({ distance: -16384, switchState: false });
  });

  it('stays idle (all zero) until samples are set', async () => {
    const { client } = setup();
    const samples = await client.actuationDepthsGet(property80);
    expect(samples).toHaveLength(property80.keyCount);
    expect(samples.every((sample) => sample.distance === 0 && !sample.switchState)).toBe(true);
  });

  it('round-trips samples through the mock device in 108-key blocks', async () => {
    const { client, device, transport } = setup();
    const samples = [
      { distance: 0, switchState: false },
      { distance: 1000, switchState: false },
      { distance: -57, switchState: false },
      { distance: 500, switchState: true },
      { distance: 2034, switchState: true },
    ];
    device.setActuationDepths(samples);
    const read = await client.actuationDepthsGet(property80);
    expect(read).toHaveLength(108);
    expect(read.slice(0, samples.length)).toEqual(samples);
    // Keys without a sample read back as idle.
    expect(read[property80.keyCount - 1]).toEqual({ distance: 0, switchState: false });
    // 216 bytes are fetched as ceil(216 / 26) = 9 chunks.
    const frames = transport.sentFrames.filter(
      (frame) => frame[0] === Cmd.ActuationDistanceWithSwitchStateAllGet,
    );
    expect(frames).toHaveLength(9);
  });
});

describe('lighting and LED config write sequences (§6.2)', () => {
  it('round-trips lighting params and verifies', async () => {
    const { client } = setup();
    const params = new Uint8Array(LIGHTING_PARAMS_SIZE);
    params[28] = 3; // mode = CHASE
    const result = await client.writeLighting(0, params);
    expect(result.ok).toBe(true);
    const readBack = await client.lightingGet(0);
    expect(readBack[28]).toBe(3);
  });

  it('round-trips the RGB LED config (Second buffer is only 2 bytes)', async () => {
    const { client } = setup();
    const result = await client.writeRgbLedConfig({ enable: true, brightness: 42 });
    expect(result).toEqual({ ok: true, mismatches: [] });
    expect(await client.rgbLedConfigGet()).toEqual({ enable: true, brightness: 42 });
  });

  it('rejects lighting params of the wrong size', async () => {
    const { client } = setup();
    await expect(client.lightingSet(0, new Uint8Array(16))).rejects.toThrow(ProtocolError);
  });
});

describe('actuation enable', () => {
  it('reads back what was written', async () => {
    const { client, device } = setup();
    expect(await client.actuationEnableGet()).toBe(true);
    await client.actuationEnableSet(false);
    expect(await client.actuationEnableGet()).toBe(false);
    expect(device.actuationEnable).toBe(false);
  });
});

describe('error handling', () => {
  it('throws UnhandledCommandError for unsupported commands', async () => {
    const { client } = setup();
    await expect(client.simple([Cmd.ADCAllGet])).rejects.toThrow(UnhandledCommandError);
  });

  it('throws TimeoutError when the device never answers', async () => {
    const { client, transport } = setup();
    transport.dropNext = true;
    await expect(client.protocolVersionGet()).rejects.toThrow(TimeoutError);
  });

  it('skips corrupted reports and returns the next valid one', async () => {
    const device = new MockDevice(property80);
    const client = new ZaneimClient(new FlakyTransport(device));
    await expect(client.protocolVersionGet()).resolves.toBe(2);
  });

  it('surfaces the device Error response (0xFE)', async () => {
    class ErroringDevice extends MockDevice {
      override handle(): number[] {
        return [Cmd.Error, 0x05];
      }
    }
    const client = new ZaneimClient(new MockTransport(new ErroringDevice(property80)));
    await expect(client.protocolVersionGet()).rejects.toThrow(DeviceErrorResponse);
  });

  it('refuses to use a closed client', async () => {
    const { client } = setup();
    await client.close();
    await expect(client.protocolVersionGet()).rejects.toThrow(ProtocolError);
  });
});

describe('bounds validation', () => {
  it('rejects a buffer offset that does not fit the 16-bit wire field', async () => {
    const { client, transport } = setup();
    // 200 * 512 = 102400, which would wrap to 36864 if it were masked.
    await expect(client.lightingSet(200, new Uint8Array(LIGHTING_PARAMS_SIZE))).rejects.toThrow(
      ProtocolError,
    );
    expect(transport.sentFrames.some((frame) => frame[0] === Cmd.RGBLightingSet)).toBe(false);
  });

  it('rejects an out-of-range profile index', async () => {
    const { client } = setup();
    const params = new Uint8Array(LIGHTING_PARAMS_SIZE);
    await expect(client.lightingSet(PROFILE_COUNT, params)).rejects.toThrow(ProtocolError);
    await expect(client.lightingGet(PROFILE_COUNT)).rejects.toThrow(ProtocolError);
    await expect(client.actuationPointsGet(PROFILE_COUNT, property80)).rejects.toThrow(ProtocolError);
    await expect(
      client.actuationPointsSet(PROFILE_COUNT, samplePoints(property80.keyCount), property80),
    ).rejects.toThrow(ProtocolError);
  });

  it('rejects a reply that echoes an offset we did not ask for', async () => {
    const client = new ZaneimClient(new OffsetLiarTransport(new MockDevice(property80)));
    await expect(client.lightingGet(0)).rejects.toThrow(ProtocolError);
  });
});

describe('ReportQueue', () => {
  it('stays bounded when a device floods reports with no consumer', () => {
    const queue = new ReportQueue();
    for (let i = 0; i < 1000; i++) queue.push(new Uint8Array(32));
    const buffered = (queue as unknown as { queue: Uint8Array[] }).queue.length;
    expect(buffered).toBeLessThanOrEqual(64);
  });
});

/** A transport whose replies always echo a different offset than requested. */
class OffsetLiarTransport implements HidTransport {
  readonly label = 'liar';
  readonly usb = {
    vendorId: ZENAIM_VENDOR_ID,
    productId: property80.productId,
    bcdDevice: property80.bcdDevice,
  };
  private readonly queue = new ReportQueue();

  constructor(private readonly device: MockDevice) {}

  async send(frame: Uint8Array): Promise<void> {
    const response = this.device.handle(frame);
    if (response.length >= 4) response[1] = ((response[1] ?? 0) + 1) & 0xff;
    this.queue.push(encodeFrame(response));
  }

  receive(timeoutMs: number): Promise<Uint8Array> {
    return this.queue.shift(timeoutMs, () => new TimeoutError('liar transport timed out'));
  }

  async close(): Promise<void> {
    this.queue.clear();
  }
}

/** Sends one CRC-corrupt report before the real one to exercise the retry path. */
class FlakyTransport implements HidTransport {
  readonly label = 'flaky';
  readonly usb = {
    vendorId: ZENAIM_VENDOR_ID,
    productId: property80.productId,
    bcdDevice: property80.bcdDevice,
  };
  private readonly queue = new ReportQueue();
  private corrupt = true;

  constructor(private readonly device: MockDevice) {}

  async send(frame: Uint8Array): Promise<void> {
    if (this.corrupt) {
      this.corrupt = false;
      const garbage = new Uint8Array(REPORT_SIZE).fill(0xaa);
      this.queue.push(garbage);
    }
    this.queue.push(encodeFrame(this.device.handle(frame)));
  }

  receive(timeoutMs: number): Promise<Uint8Array> {
    return this.queue.shift(timeoutMs, () => new TimeoutError('flaky transport timed out'));
  }

  async close(): Promise<void> {
    this.queue.clear();
  }
}
