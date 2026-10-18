import { describe, expect, it } from 'vitest';
import {
  DEVICE_PROPERTIES,
  pickDeviceProperty,
  resolveDeviceProperties,
  ZENAIM_VENDOR_ID,
} from '../src/lib/protocol/deviceProperties';

const prop = (modelName: string, productId: number, bcdDevice?: number) => ({
  vendorId: ZENAIM_VENDOR_ID,
  productId,
  ...(bcdDevice === undefined ? {} : { bcdDevice }),
  modelName,
});

describe('deviceProperty resolution (docs/protocol.md §5)', () => {
  it('resolves by exact modelName when the revision is unknown', () => {
    // WebHID does not expose bcdDevice; modelName must disambiguate KB011 revs.
    const [candidate] = resolveDeviceProperties(prop('KB011-DGBK', 0x0003, undefined));
    expect(candidate?.series).toBe('ZK1 80US');
    expect(candidate?.modelName).toBe('KB011-DGBK');
  });

  it('prefers the newest revision when only USB identity is known', () => {
    const picked = pickDeviceProperty(prop('', 0x0003, undefined));
    expect(picked?.bcdDevice).toBe(0x0102);
    expect(picked?.referenceVoltage).toBe(2900);
  });

  it('uses bcdDevice when the transport can provide it', () => {
    const picked = pickDeviceProperty({ vendorId: ZENAIM_VENDOR_ID, productId: 0x0003, bcdDevice: 0x0100 });
    expect(picked?.modelName).toBe('KB007-DGBK');
    expect(picked?.referenceVoltage).toBe(2048);
  });

  it('needs modelName to tell the two 19Key families apart (shared PID 0x000b)', () => {
    const withoutName = resolveDeviceProperties(prop('', 0x000b, 0x0100));
    expect(new Set(withoutName.map((p) => p.modelName))).toEqual(new Set(['AC001-BKBK', 'AC002-BKBK']));

    const withName = resolveDeviceProperties(prop('AC001-BKBK', 0x000b, 0x0100));
    expect(withName).toHaveLength(1);
    expect(withName[0]?.keyCount).toBe(57);
    expect(withName[0]?.temperatureCount).toBe(19);
  });

  it('returns nothing for a foreign vendor', () => {
    expect(resolveDeviceProperties({ vendorId: 0x1234, productId: 0x0003 })).toEqual([]);
  });

  it('derives adcCount as keyCount + temperatureCount', () => {
    for (const entry of DEVICE_PROPERTIES) {
      expect(entry.adcCount).toBe(entry.keyCount + entry.temperatureCount);
      expect(entry.keyCount).toBe(entry.rows * entry.columns);
    }
  });

  it('keeps the documented 80-series default actuation values', () => {
    const picked = pickDeviceProperty({ vendorId: ZENAIM_VENDOR_ID, productId: 0x0003, bcdDevice: 0x0100 });
    expect(picked?.initialNormal).toEqual({ pointOn: 1500, pointOff: 1300 });
    expect(picked?.actuationDistance).toBe(1800);
  });
});
