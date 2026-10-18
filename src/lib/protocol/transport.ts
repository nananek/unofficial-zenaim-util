import type { UsbIdentity } from './deviceProperties';

/**
 * A byte-level HID endpoint: one 32-byte output report out, input reports back.
 *
 * Commands must be issued one at a time (docs/protocol.md §2.3), so transports
 * are not required to be safe for concurrent `send`/`receive` pairs — the
 * `ZaneimClient` serialises access.
 */
export interface HidTransport {
  /** Human readable label shown in the UI ("WebHID", "demo", ...). */
  readonly label: string;
  /** USB identity, used to resolve the `deviceProperty` table. */
  readonly usb: UsbIdentity;
  /** Send one 32-byte logical frame. */
  send(frame: Uint8Array): Promise<void>;
  /** Resolve with the next input report, or reject with `TimeoutError`. */
  receive(timeoutMs: number): Promise<Uint8Array>;
  /** Release the underlying device. Safe to call more than once. */
  close(): Promise<void>;
}

/** Small helper shared by the async-queue style transports. */
export class ReportQueue {
  private readonly queue: Uint8Array[] = [];
  private readonly waiters: Array<{
    resolve: (value: Uint8Array) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  /**
   * Commands are serialised, so at most a couple of replies ever need buffering.
   * The cap keeps a device that floods input reports from growing the queue (and
   * the heap) without bound; the oldest reports are dropped first.
   */
  constructor(private readonly maxSize = 64) {}

  push(report: Uint8Array): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(report);
    } else {
      this.queue.push(report);
      if (this.queue.length > this.maxSize) {
        this.queue.splice(0, this.queue.length - this.maxSize);
      }
    }
  }

  shift(timeoutMs: number, makeError: () => Error): Promise<Uint8Array> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((w) => w.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(makeError());
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  clear(): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('transport closed'));
    }
    this.queue.length = 0;
  }
}
