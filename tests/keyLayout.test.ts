import { describe, expect, it } from 'vitest';
import { pickDeviceProperty, ZENAIM_VENDOR_ID } from '../src/lib/protocol/deviceProperties';
import { deviceKeyNames } from '../src/lib/protocol/keyLayout';

/** Resolve the deviceProperty entry for a USB identity, like the configurator does. */
function property(productId: number, bcdDevice: number) {
  return pickDeviceProperty({ vendorId: ZENAIM_VENDOR_ID, productId, bcdDevice })!;
}

describe('ZK1 80US key names', () => {
  it('maps device indices to key names, leaving 19 positions unnamed', () => {
    const names = deviceKeyNames(property(0x0003, 0x0100)); // KB007-DGBK
    expect(names).toHaveLength(108);
    expect(names?.[0]).toBe('Esc');
    expect(names?.[31]).toBeNull();
    expect(names?.[68]).toBe('ENTER');
    expect(names?.[72]).toBe('SHIFT');
    expect(names?.[85]).toBe('RSHIFT');
    expect(names?.[96]).toBe('Space');
    expect(names?.filter((name) => name === null)).toHaveLength(19);
    expect(names?.filter((name) => name !== null)).toHaveLength(89);
  });

  it('returns null for other series', () => {
    const sixtyUs = property(0x0006, 0x0100); // KB009-DGBK
    expect(sixtyUs.series).toBe('ZK1 60US');
    expect(sixtyUs.keyCount).toBe(75);
    expect(deviceKeyNames(sixtyUs)).toBeNull();
  });

  it('returns null for the 80JIS layout even though the matrix size matches', () => {
    const eightyJis = property(0x0002, 0x0100); // KB006-DGBK
    expect(eightyJis.series).toBe('ZK1 80JIS');
    expect(eightyJis.keyCount).toBe(108);
    expect(deviceKeyNames(eightyJis)).toBeNull();
  });
});
