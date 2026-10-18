import {
  ZENAIM_USAGE,
  ZENAIM_USAGE_PAGE,
  ZENAIM_VENDOR_ID,
  type UsbIdentity,
} from '../protocol/deviceProperties';
import type { HidTransport } from '../protocol/transport';
import { ReportQueue } from '../protocol/transport';
import { TimeoutError } from '../protocol/errors';

/**
 * Minimal structural typings for the WebHID API. Declared locally so the
 * project does not depend on whether the TypeScript DOM lib ships WebHID
 * declarations, and so the protocol layer stays testable in Node.
 */
export interface WebHidInputReportEvent {
  data: DataView;
}

export interface WebHidDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: 'inputreport', listener: (event: WebHidInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: WebHidInputReportEvent) => void): void;
}

export interface WebHidApi {
  requestDevice(options: {
    filters: Array<Record<string, number>>;
  }): Promise<WebHidDevice[]>;
  getDevices(): Promise<WebHidDevice[]>;
}

export function getWebHid(): WebHidApi | undefined {
  const nav = (globalThis as { navigator?: { hid?: WebHidApi } }).navigator;
  return nav?.hid;
}

export function isWebHidSupported(): boolean {
  return getWebHid() !== undefined;
}

/** Interface 1 (usagePage 0xFF60 / usage 0x61) — see docs/protocol.md §1.2. */
export const ZENAIM_HID_FILTER = {
  vendorId: ZENAIM_VENDOR_ID,
  usagePage: ZENAIM_USAGE_PAGE,
  usage: ZENAIM_USAGE,
};

export class WebHidTransport implements HidTransport {
  readonly label = 'WebHID';
  private readonly queue = new ReportQueue();
  private closed = false;

  private readonly onInputReport = (event: WebHidInputReportEvent) => {
    const { data } = event;
    this.queue.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  };

  private constructor(readonly device: WebHidDevice) {}

  /** Open an already-granted device (no user gesture required in Chrome). */
  static async open(device: WebHidDevice): Promise<WebHidTransport> {
    const transport = new WebHidTransport(device);
    if (!device.opened) await device.open();
    device.addEventListener('inputreport', transport.onInputReport);
    return transport;
  }

  /** Prompt the user to pick a ZENAIM KEYBOARD. Returns undefined if cancelled. */
  static async request(): Promise<WebHidTransport | undefined> {
    const hid = getWebHid();
    if (!hid) throw new Error('WebHID is not available in this browser');
    const devices = await hid.requestDevice({ filters: [ZENAIM_HID_FILTER] });
    const device = devices[0];
    return device ? WebHidTransport.open(device) : undefined;
  }

  /** Previously granted devices, filtered to the protocol interface. */
  static async granted(): Promise<WebHidDevice[]> {
    const hid = getWebHid();
    if (!hid) return [];
    const devices = await hid.getDevices();
    return devices.filter((device) => device.vendorId === ZENAIM_VENDOR_ID);
  }

  /**
   * WebHID does not expose bcdDevice, so the revision has to be resolved from
   * `modelName` plus the candidate table (see deviceProperties.ts).
   */
  get usb(): UsbIdentity {
    return { vendorId: this.device.vendorId, productId: this.device.productId };
  }

  async send(frame: Uint8Array): Promise<void> {
    // Report ID 0: the 0x00 prefix from the hidraw write form is the report id.
    await this.device.sendReport(0, frame);
  }

  receive(timeoutMs: number): Promise<Uint8Array> {
    return this.queue.shift(timeoutMs, () => new TimeoutError('no input report from the device'));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.device.removeEventListener('inputreport', this.onInputReport);
    this.queue.clear();
    if (this.device.opened) await this.device.close();
  }
}
