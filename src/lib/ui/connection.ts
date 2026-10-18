import { WebHidTransport, getWebHid, isWebHidSupported } from '../hid/webhid';
import { ZaneimClient, type DeviceIdentity } from '../protocol/client';
import { ZENAIM_VENDOR_ID, pickDeviceProperty } from '../protocol/deviceProperties';
import { MockDevice, MockTransport } from '../protocol/mockDevice';
import type { HidTransport } from '../protocol/transport';

export type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | {
      kind: 'connected';
      client: ZaneimClient;
      identity: DeviceIdentity;
      transportLabel: string;
      demo: boolean;
    }
  | { kind: 'error'; message: string };

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Status pill class + message key for a connection state. */
export function connectionStatus(state: ConnectionState): { cls: string; key: string } {
  switch (state.kind) {
    case 'connected':
      return state.demo
        ? { cls: 'is-demo', key: 'state.demo' }
        : { cls: 'is-connected', key: 'state.connected' };
    case 'connecting':
      return { cls: 'is-connecting', key: 'state.connecting' };
    case 'error':
      return { cls: 'is-error', key: 'state.error' };
    default:
      return { cls: '', key: 'state.disconnected' };
  }
}

/**
 * Owns the transport/client lifecycle and broadcasts state changes, so the
 * landing page and the configurator can share one implementation.
 */
export class Connection {
  private state: ConnectionState = { kind: 'disconnected' };
  private readonly listeners = new Set<(state: ConnectionState) => void>();

  get current(): ConnectionState {
    return this.state;
  }

  get supported(): boolean {
    return isWebHidSupported();
  }

  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Prompt for a device (requires a user gesture). Resolves to false if cancelled. */
  async requestDevice(): Promise<boolean> {
    if (!getWebHid()) throw new Error('WebHID is not available in this browser');
    this.setState({ kind: 'connecting' });
    let transport: WebHidTransport | undefined;
    try {
      transport = await WebHidTransport.request();
    } catch (error) {
      this.setState({ kind: 'error', message: describeError(error) });
      return false;
    }
    if (!transport) {
      this.setState({ kind: 'disconnected' });
      return false;
    }
    await this.adopt(transport, false);
    return true;
  }

  /** Open a previously granted device without prompting, if there is one. */
  async reconnectGranted(): Promise<boolean> {
    const granted = await WebHidTransport.granted();
    if (granted.length === 0) return false;
    this.setState({ kind: 'connecting' });
    try {
      const transport = await WebHidTransport.open(granted[0]!);
      await this.adopt(transport, false);
      return true;
    } catch (error) {
      this.setState({ kind: 'error', message: describeError(error) });
      return false;
    }
  }

  /** Connect to an in-memory mock device so the UI works without hardware. */
  async connectDemo(): Promise<void> {
    this.setState({ kind: 'connecting' });
    const property = pickDeviceProperty({
      vendorId: ZENAIM_VENDOR_ID,
      productId: 0x0003,
      bcdDevice: 0x0100,
    })!;
    const device = new MockDevice(property);
    // A little latency makes the demo behave like a real device.
    const transport = new MockTransport(device, { latencyMs: 20 });
    await this.adopt(transport, true);
  }

  async adopt(transport: HidTransport, demo: boolean): Promise<void> {
    try {
      const client = new ZaneimClient(transport);
      const identity = await client.identify();
      this.setState({ kind: 'connected', client, identity, transportLabel: transport.label, demo });
    } catch (error) {
      await transport.close().catch(() => undefined);
      this.setState({ kind: 'error', message: describeError(error) });
    }
  }

  async disconnect(): Promise<void> {
    if (this.state.kind === 'connected') {
      await this.state.client.close().catch(() => undefined);
    }
    this.setState({ kind: 'disconnected' });
  }
}
