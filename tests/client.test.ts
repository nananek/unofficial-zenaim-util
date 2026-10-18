import { describe, expect, it } from 'vitest';
import { Cmd } from '../src/lib/protocol/commands';
import { ZENAIM_VENDOR_ID, pickDeviceProperty } from '../src/lib/protocol/deviceProperties';
import { MockDevice, MockTransport } from '../src/lib/protocol/mockDevice';
import { ZaneimClient, type ActuationPoint } from '../src/lib/protocol/client';
import {
  DeviceErrorResponse,
  ProtocolError,
  TimeoutError,
  UnhandledCommandError,
} from '../src/lib/protocol/errors';
import { encodeFrame, REPORT_SIZE } from '../src/lib/protocol/frame';
import { ReportQueue, type HidTransport } from '../src/lib/protocol/transport';
import { LIGHTING_PARAMS_SIZE } from '../src/lib/protocol/enums';

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
        // Swallow AllSet: staging never happens, so the read-back keeps the old values.
        if (frame[0] === Cmd.ActuationPointAllSet) return [Cmd.ActuationPointAllSet];
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
