import { describe, expect, it } from 'vitest';
import { crc8 } from '../src/lib/protocol/crc8';
import { decodeFrame, encodeFrame, MAX_COMMAND_BYTES, REPORT_SIZE } from '../src/lib/protocol/frame';
import { CrcError, ProtocolError } from '../src/lib/protocol/errors';
import { Cmd } from '../src/lib/protocol/commands';

const ascii = (value: string) => Array.from(new TextEncoder().encode(value));

describe('crc8', () => {
  it('matches the check value from the spec', () => {
    // docs/protocol.md §2.2: crc8("123456789") = 0xF4
    expect(crc8(ascii('123456789'))).toBe(0xf4);
  });

  it('is unchanged by a leading 0x00 byte (zero seed)', () => {
    expect(crc8([0x00, 0x30, 0x01])).toBe(crc8([0x30, 0x01]));
  });

  it('returns 0 for empty input', () => {
    expect(crc8([])).toBe(0);
  });
});

describe('frame codec', () => {
  it('produces a 32-byte frame with the CRC in the last byte', () => {
    const frame = encodeFrame([Cmd.ProtocolVersionGet]);
    expect(frame.length).toBe(REPORT_SIZE);
    expect(frame[0]).toBe(0x30);
    expect(frame[REPORT_SIZE - 1]).toBe(crc8(frame.subarray(0, REPORT_SIZE - 1)));
  });

  it('round-trips through decodeFrame', () => {
    const frame = encodeFrame([Cmd.KeyboardInfoGet, 0x00, 0x01, 0x1a, 0x00]);
    expect(() => decodeFrame(frame)).not.toThrow();
  });

  it('rejects a corrupted frame', () => {
    const frame = encodeFrame([Cmd.ProtocolVersionGet]);
    frame[5] ^= 0xff;
    expect(() => decodeFrame(frame)).toThrow(CrcError);
  });

  it('rejects a command that does not fit in one frame', () => {
    expect(() => encodeFrame(new Array(MAX_COMMAND_BYTES + 1).fill(0))).toThrow(ProtocolError);
  });

  it('rejects out-of-range command bytes', () => {
    expect(() => encodeFrame([0x100])).toThrow(ProtocolError);
  });

  it('rejects a report of the wrong length', () => {
    expect(() => decodeFrame(new Uint8Array(10))).toThrow(ProtocolError);
  });
});
