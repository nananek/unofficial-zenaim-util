import { clear } from '../lib/ui/dom';
import { Connection, connectionStatus, describeError } from '../lib/ui/connection';
import { renderDeviceInfo } from '../lib/ui/deviceInfo';
import { onLangChange, t } from '../lib/ui/i18n';

const connection = new Connection();

const statusEl = document.querySelector<HTMLElement>('#connect-status');
const infoSlot = document.querySelector<HTMLElement>('#device-info-slot');
const connectButton = document.querySelector<HTMLButtonElement>('#connect-button');
const demoButton = document.querySelector<HTMLButtonElement>('#demo-button');
const unsupported = document.querySelector<HTMLElement>('#unsupported');

function render(): void {
  const state = connection.current;

  if (statusEl) {
    const { cls, key } = connectionStatus(state);
    statusEl.className = `status ${cls}`;
    statusEl.textContent = state.kind === 'error' ? `${t(key)}: ${state.message}` : t(key);
  }

  if (infoSlot) {
    clear(infoSlot);
    if (state.kind === 'connected') {
      infoSlot.append(renderDeviceInfo(state.identity, state.transportLabel));
    }
  }

  if (connectButton) connectButton.disabled = state.kind === 'connecting';
  if (demoButton) demoButton.disabled = state.kind === 'connecting';
}

connectButton?.addEventListener('click', async () => {
  try {
    await connection.requestDevice();
  } catch (error) {
    console.error(describeError(error));
  }
  render();
});

demoButton?.addEventListener('click', async () => {
  await connection.connectDemo();
  render();
});

connection.subscribe(render);
onLangChange(render);

if (!connection.supported) {
  if (unsupported) unsupported.hidden = false;
  if (connectButton) connectButton.disabled = true;
  if (demoButton) demoButton.disabled = true;
}

render();
