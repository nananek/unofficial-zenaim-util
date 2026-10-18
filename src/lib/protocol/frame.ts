import { crc8 } from './crc8';
import { CrcError, ProtocolError } from './errors';

/** Logical frame size, derived from the HID report length of interface 1. */
export const REPORT_SIZE = 32;
/** Command bytes that fit in one report before the trailing CRC byte. */
export const MAX_COMMAND_BYTES = REPORT_SIZE - 1; // 31
/** GetBuffer / SetBuffer payload chunk size (docs/protocol.md §2.4). */
export const CHUNK_SIZE = 26;

/**
 * Build a 32-byte logical frame: `[command..., 0x00 pad, crc8]`.
 *
 * The 0x00 report-id prefix used by the hidraw write form is not needed here:
 * the CRC is computed over the report payload and a leading 0x00 would not
 * change a zero-seeded CRC-8 anyway (see `crc8.ts`).
 */
export function encodeFrame(command: ArrayLike<number>): Uint8Array {
  if (command.length > MAX_COMMAND_BYTES) {
    throw new ProtocolError(
      `command is ${command.length} bytes; the frame only fits ${MAX_COMMAND_BYTES}`,
    );
  }
  const frame = new Uint8Array(REPORT_SIZE);
  for (let i = 0; i < command.length; i++) {
    const byte = command[i];
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw new ProtocolError(`command byte ${i} is not a valid octet: ${byte}`);
    }
    frame[i] = byte;
  }
  frame[REPORT_SIZE - 1] = crc8(frame.subarray(0, REPORT_SIZE - 1));
  return frame;
}

/** Validate a received report and return it. Throws `CrcError` on mismatch. */
export function decodeFrame(report: Uint8Array, verifyCrc = true): Uint8Array {
  if (report.length !== REPORT_SIZE) {
    throw new ProtocolError(`expected a ${REPORT_SIZE}-byte report, got ${report.length}`);
  }
  if (verifyCrc) {
    const expected = crc8(report.subarray(0, REPORT_SIZE - 1));
    if (report[REPORT_SIZE - 1] !== expected) {
      throw new CrcError(report);
    }
  }
  return report;
}
