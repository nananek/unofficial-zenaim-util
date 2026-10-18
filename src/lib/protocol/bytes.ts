/** Little-endian / string codecs shared by the command layer. */

export function readU16LE(bytes: ArrayLike<number>, offset: number): number {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) & 0xffff;
}

export function writeU16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

/** 14-bit signed value packed into two little-endian bytes (docs/protocol.md §3.20). */
export function readInt14LE(bytes: ArrayLike<number>, offset: number): number {
  const raw = readU16LE(bytes, offset);
  const value = raw & 0x3fff;
  return value & 0x2000 ? value - 0x4000 : value;
}

export function readFloat32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(offset, true);
}

export function writeFloat32LE(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setFloat32(offset, value, true);
}

/** Decode a NUL-terminated UTF-8 string from a fixed-width field. */
export function decodeCString(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** Encode a UTF-8 string into a NUL-terminated fixed-width field. */
export function encodeCString(value: string, width: number): Uint8Array {
  const out = new Uint8Array(width);
  const encoded = new TextEncoder().encode(value);
  out.set(encoded.subarray(0, Math.max(0, width - 1)));
  return out;
}
