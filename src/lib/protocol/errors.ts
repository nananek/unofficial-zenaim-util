/** Base class for everything the protocol layer throws. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

/** No (matching) response arrived within the timeout. */
export class TimeoutError extends ProtocolError {
  constructor(message = 'no response from device (timeout)') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** A received report failed the CRC-8 check (docs/protocol.md §2.1). */
export class CrcError extends ProtocolError {
  constructor(readonly received: Uint8Array) {
    super('received report failed the CRC-8 check');
    this.name = 'CrcError';
  }
}

/** The device answered with the Error response (0xFE); `code` is `data[1]`. */
export class DeviceErrorResponse extends ProtocolError {
  constructor(readonly code: number) {
    super(`device returned an error response (code 0x${code.toString(16).padStart(2, '0')})`);
    this.name = 'DeviceErrorResponse';
  }
}

/** The device answered with Unhandled (0xFF) for an unsupported command. */
export class UnhandledCommandError extends ProtocolError {
  constructor(readonly command: number) {
    super(`command 0x${command.toString(16).padStart(2, '0')} is not handled by the device`);
    this.name = 'UnhandledCommandError';
  }
}
