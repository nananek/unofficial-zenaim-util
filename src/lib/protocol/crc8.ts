/**
 * CRC-8 as used by the ZENAIM KEYBOARD host HID protocol.
 *
 * Parameters: width=8 / poly=0x07 / init=0x00 / refin=false / refout=false / xorout=0x00
 * (the same parameters as reveng "CRC-8" / CRC-8/SMBUS).
 * Check value: `crc8("123456789") === 0xF4` (docs/protocol.md §2.2).
 *
 * Note: because the initial value is zero and the polynomial is applied to a
 * zero-seeded register, prepending 0x00 bytes does not change the result. That
 * is why the spec can both say "the write form is 33 bytes with a 0x00 report-id
 * prefix, and the CRC covers bytes 0..31" and have it match the 31 command bytes
 * alone (docs/protocol.md §2.1).
 */
export function crc8(data: ArrayLike<number>): number {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}
