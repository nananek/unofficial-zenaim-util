import { Connection, connectionStatus, describeError } from '../lib/ui/connection';
import { renderDeviceInfo } from '../lib/ui/deviceInfo';
import { clear, h, type Child } from '../lib/ui/dom';
import { applyI18n, getLang, onLangChange, t } from '../lib/ui/i18n';
import type { ActuationPoint, Backup, RgbLedConfig } from '../lib/protocol/client';
import type { DeviceProperty } from '../lib/protocol/deviceProperties';
import {
  LIGHTING_INDICATORS,
  LIGHTING_MODE_LABELS,
  LIGHTING_MODE_OFFSET,
  LIGHTING_PARAMS_SIZE,
  PROFILE_COUNT,
  PROFILE_LABELS,
} from '../lib/protocol/enums';
import { deviceKeyNames } from '../lib/protocol/keyLayout';

type Tab = 'connect' | 'actuation' | 'lighting' | 'backup';

interface Notice {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

interface AppState {
  tab: Tab;
  notice: Notice | null;
  busy: string | null;
  apLoaded: boolean;
  apProfile: number;
  apPoints: ActuationPoint[];
  apSelected: number | null;
  apEnabled: boolean;
  apDirty: boolean;
  ledLoaded: boolean;
  led: RgbLedConfig;
  ltLoaded: boolean;
  ltProfile: number;
  ltParams: Uint8Array | null;
  ltMode: number;
}

const state: AppState = {
  tab: 'connect',
  notice: null,
  busy: null,
  apLoaded: false,
  apProfile: 0,
  apPoints: [],
  apSelected: null,
  apEnabled: true,
  apDirty: false,
  ledLoaded: false,
  led: { enable: true, brightness: 128 },
  ltLoaded: false,
  ltProfile: 0,
  ltParams: null,
  ltMode: 0,
};

const connection = new Connection();
const root = document.querySelector<HTMLElement>('#config-root')!;
const overlaySlot = document.querySelector<HTMLElement>('#overlay-slot')!;

/* ------------------------------------------------------------------ utils */

function connected() {
  const snapshot = connection.current;
  return snapshot.kind === 'connected' ? snapshot : null;
}

function profileLabel(profile: number): string {
  const label = PROFILE_LABELS[profile];
  return label ? label[getLang()] : String(profile);
}

function thresholdColor(value: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, value / (max || 1)));
  return `hsl(${210 - 210 * ratio} 70% 42%)`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function renderOverlay(): void {
  clear(overlaySlot);
  if (state.busy) overlaySlot.append(h('div', { class: 'busy-overlay' }, h('span', { text: state.busy })));
}

function setBusyText(text: string): void {
  state.busy = text;
  renderOverlay();
}

async function withBusy(label: string, task: () => Promise<void>): Promise<void> {
  state.busy = label;
  state.notice = null;
  render();
  try {
    await task();
  } catch (error) {
    state.notice = { kind: 'error', text: describeError(error) };
  } finally {
    state.busy = null;
    render();
  }
}

/* ------------------------------------------------------------------- tabs */

const TABS: Array<{ id: Tab; key: string }> = [
  { id: 'connect', key: 'tab.connect' },
  { id: 'actuation', key: 'tab.actuation' },
  { id: 'lighting', key: 'tab.lighting' },
  { id: 'backup', key: 'tab.backup' },
];

function renderTabs(): HTMLElement {
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const tab of TABS) {
    tabs.append(
      h('button', {
        type: 'button',
        role: 'tab',
        class: state.tab === tab.id ? 'is-active' : '',
        'aria-selected': String(state.tab === tab.id),
        text: t(tab.key),
        onclick: () => {
          state.tab = tab.id;
          state.notice = null;
          render();
        },
      }),
    );
  }
  return tabs;
}

/* -------------------------------------------------------------- connection */

function renderConnectPanel(): HTMLElement {
  const snapshot = connection.current;
  const { cls, key } = connectionStatus(snapshot);
  const status = h('p', { class: `status ${cls}` });
  status.textContent = snapshot.kind === 'error' ? `${t(key)}: ${snapshot.message}` : t(key);

  const buttons = h('div', { class: 'button-row' });
  if (snapshot.kind === 'connected') {
    buttons.append(
      h('button', {
        type: 'button',
        text: t('connect.disconnect'),
        onclick: () => void connection.disconnect(),
      }),
    );
  } else {
    buttons.append(
      h('button', {
        type: 'button',
        class: 'primary',
        text: t('connect.request'),
        disabled: snapshot.kind === 'connecting' || !connection.supported,
        onclick: () => void connection.requestDevice().then(render),
      }),
      h('button', {
        type: 'button',
        text: t('connect.reconnect'),
        disabled: snapshot.kind === 'connecting' || !connection.supported,
        onclick: () =>
          void connection
            .reconnectGranted()
            .then((ok) => {
              if (!ok) state.notice = { kind: 'warn', text: t('connect.needGesture') };
              render();
            }),
      }),
      h('button', {
        type: 'button',
        text: t('connect.demo'),
        disabled: snapshot.kind === 'connecting',
        onclick: () => void connection.connectDemo().then(render),
      }),
    );
  }

  const children: Child[] = [
    h('h2', { text: t('connect.request') }),
    buttons,
    status,
    h('p', { class: 'small muted', text: t('connect.demo.hint') }),
  ];
  if (!connection.supported) {
    children.push(h('p', { class: 'notice warn', text: t('connect.unsupported') }));
  }
  if (snapshot.kind === 'connected') {
    children.push(h('p', { class: 'small muted', text: t('index.connect.hint') }));
    children.push(renderDeviceInfo(snapshot.identity, snapshot.transportLabel));
  }
  return h('div', { class: 'card' }, ...children) as HTMLElement;
}

/* -------------------------------------------------------------- actuation */

function renderActuation(): HTMLElement {
  const snapshot = connected();
  if (!snapshot) return renderNeedConnection();
  const property = snapshot.identity.property;
  if (!property) return h('div', { class: 'card' }, h('p', { text: t('device.unknown') })) as HTMLElement;

  const profileSelect = h(
    'select',
    {
      onchange: (event: Event) => {
        const value = Number((event.currentTarget as HTMLSelectElement).value);
        void loadActuation(value);
      },
    },
    ...Array.from({ length: PROFILE_COUNT }, (_, index) =>
      h('option', { value: String(index), selected: index === state.apProfile, text: profileLabel(index) }),
    ),
  );

  const enable = h('input', {
    type: 'checkbox',
    checked: state.apEnabled,
    disabled: !state.apLoaded,
    onchange: (event: Event) => {
      const value = (event.currentTarget as HTMLInputElement).checked;
      void withBusy(t('common.busy'), async () => {
        await snapshot.client.actuationEnableSet(value);
        state.apEnabled = value;
      });
    },
  });

  const body: Child[] = [
    h('div', { class: 'section-heading' },
      h('div', null,
        h('p', { class: 'eyebrow', text: t('actuation.eyebrow') }),
        h('h2', { text: t('actuation.title') }),
        h('p', { class: 'muted', text: t('actuation.body') }),
      ),
      state.apDirty ? h('span', { class: 'config-chip is-dirty', text: t('actuation.dirty') }) : h('span', { class: 'config-chip', text: property.series }),
    ),
    h(
      'div',
      { class: 'control-bar' },
      h('label', { class: 'small muted', text: t('actuation.profile') }),
      profileSelect,
      h('button', {
        type: 'button',
        class: 'primary',
        text: t('actuation.read'),
        disabled: state.busy !== null,
        onclick: () => void loadActuation(state.apProfile),
      }),
      h(
        'label',
        { class: 'field-row small' },
        enable,
        h('span', { text: t('actuation.enable') }),
      ),
    ),
    h('p', { class: 'small muted inline-hint', text: t('actuation.enable.hint') }),
  ];

  if (!state.apLoaded) {
    body.push(h('p', { class: 'notice', text: t('actuation.notLoaded') }));
    return h('div', { class: 'card' }, ...body) as HTMLElement;
  }

  body.push(
    h('div', { class: 'actuation-layout' },
      h('section', { class: 'keymap-panel' },
        h('div', { class: 'panel-heading' },
          h('div', null,
            h('h3', { text: t('actuation.grid') }),
            h('p', { class: 'small muted', text: t('actuation.positionHint') }),
          ),
          h('span', { class: 'badge', text: t('actuation.keyCount', { count: state.apPoints.length }) }),
        ),
        renderKeyGrid(),
        h('p', { class: 'keymap-footnote', text: t('actuation.mappingNote') }),
      ),
      h('aside', { class: 'editor-panel' },
        h('div', { class: 'panel-heading' },
          h('div', null,
            h('p', { class: 'eyebrow', text: t('actuation.editor') }),
            h('h3', { text: t('actuation.selected') }),
          ),
        ),
        renderPointEditor(),
      ),
    ),
    h('div', { class: 'actuation-actions' },
      h('div', { class: 'button-row' },
        h('button', {
          type: 'button',
          text: t('actuation.applyAll'),
          disabled: state.apSelected === null,
          onclick: () => applySelectedToAllKeys(),
        }),
        h('button', {
          type: 'button',
          text: t('actuation.defaults'),
          onclick: () => resetToDefaults(),
        }),
      ),
      h('button', {
        type: 'button',
        class: 'primary save-button',
        text: t('actuation.write'),
        onclick: () => void writeActuation(),
      }),
    ),
  );
  return h('div', { class: 'card' }, ...body) as HTMLElement;
}

/** Grid cell label for a device index: the key name when known, else `#NN`. */
function cellLabel(property: DeviceProperty, index: number, name: string | null, value: number): string {
  const row = Math.floor(index / property.columns) + 1;
  const column = (index % property.columns) + 1;
  return name === null
    ? t('actuation.cellTitle', { index: index + 1, row, column, value })
    : t('actuation.cellTitleNamed', { name, row, column, value });
}

function renderKeyGrid(): HTMLElement {
  const property = connected()?.identity.property;
  if (!property) return h('div');
  const names = deviceKeyNames(property);
  const grid = h('div', {
    class: 'key-grid',
    style: { gridTemplateColumns: `repeat(${property.columns}, minmax(0, 1fr))` },
  });
  state.apPoints.forEach((point, index) => {
    const name = names?.[index] ?? null;
    const title = cellLabel(property, index, name, point.pointOn);
    grid.append(
      h('button', {
        type: 'button',
        class: `key-cell${state.apSelected === index ? ' is-selected' : ''}`,
        dataset: { index: String(index) },
        title,
        'aria-label': title,
        text: name ?? `#${String(index + 1).padStart(2, '0')}`,
        style: { backgroundColor: thresholdColor(point.pointOn, property.actuationDistance) },
        onclick: () => {
          state.apSelected = index;
          render();
        },
      }),
    );
  });
  return grid;
}

function refreshCell(index: number): void {
  const property = connected()?.identity.property;
  const point = state.apPoints[index];
  if (!property || !point) return;
  const cell = root.querySelector<HTMLElement>(`.key-cell[data-index="${index}"]`);
  if (!cell) return;
  const name = deviceKeyNames(property)?.[index] ?? null;
  cell.title = cellLabel(property, index, name, point.pointOn);
  cell.setAttribute('aria-label', cell.title);
  cell.style.backgroundColor = thresholdColor(point.pointOn, property.actuationDistance);
}

function renderPointEditor(): HTMLElement {
  const property = connected()?.identity.property;
  const index = state.apSelected;
  const point = index === null ? undefined : state.apPoints[index];
  if (!property || index === null || !point) {
    return h('p', { class: 'muted', text: t('actuation.none') });
  }
  const max = property.actuationDistance;
  const row = Math.floor(index / property.columns) + 1;
  const column = (index % property.columns) + 1;
  const name = deviceKeyNames(property)?.[index] ?? null;
  return h(
    'div',
    null,
    h('div', { class: 'selected-key-card' },
      h('span', { class: 'selected-key-id', text: `#${String(index + 1).padStart(2, '0')}` }),
      h('div', null,
        h('strong', { text: name ?? t('actuation.noKeyName') }),
        h('span', { class: 'small muted', text: t('actuation.position', { row, column }) }),
      ),
    ),
    pointField(t('actuation.pointOn'), point.pointOn, max, (value) => {
      point.pointOn = value;
      state.apDirty = true;
      refreshCell(index);
    }),
    pointField(t('actuation.pointOff'), point.pointOff, max, (value) => {
      point.pointOff = value;
      state.apDirty = true;
      refreshCell(index);
    }),
  );
}

function pointField(
  label: string,
  value: number,
  max: number,
  onChange: (value: number) => void,
): HTMLElement {
  const range = h('input', { type: 'range', min: '0', max: String(max), step: '10', value: String(value) });
  const number = h('input', {
    type: 'number',
    min: '0',
    max: String(max),
    step: '10',
    value: String(value),
    style: { width: '6rem' },
  });
  const sync = (next: number) => {
    const clamped = Math.max(0, Math.min(max, Math.round(next)));
    range.value = String(clamped);
    number.value = String(clamped);
    onChange(clamped);
  };
  range.addEventListener('input', () => sync(Number(range.value)));
  number.addEventListener('input', () => sync(Number(number.value)));
  return h(
    'div',
    { class: 'field' },
    h('label', { text: label }),
    h('div', { class: 'field-row' }, range, number, h('span', { class: 'small muted', text: t('actuation.unit') })),
  );
}

async function loadActuation(profile: number): Promise<void> {
  const snapshot = connected();
  const property = snapshot?.identity.property;
  if (!snapshot || !property) return;
  await withBusy(t('actuation.loading'), async () => {
    const points = await snapshot.client.actuationPointsGet(profile, property);
    state.apProfile = profile;
    state.apPoints = points;
    state.apLoaded = true;
    state.apSelected = 0;
    state.apDirty = false;
    state.apEnabled = await snapshot.client.actuationEnableGet();
  });
}

function applySelectedToAllKeys(): void {
  const index = state.apSelected;
  const source = index === null ? undefined : state.apPoints[index];
  if (!source) return;
  state.apPoints = state.apPoints.map(() => ({ ...source }));
  state.apDirty = true;
  render();
}

function resetToDefaults(): void {
  const property = connected()?.identity.property;
  if (!property) return;
  state.apPoints = state.apPoints.map(() => ({ ...property.initialNormal }));
  state.apDirty = true;
  render();
}

async function writeActuation(): Promise<void> {
  const snapshot = connected();
  const property = snapshot?.identity.property;
  if (!snapshot || !property || !state.apLoaded) return;
  const message = t('actuation.confirm', {
    profile: profileLabel(state.apProfile),
    count: property.keyCount,
  });
  if (!window.confirm(message)) return;
  await withBusy(t('actuation.writing'), async () => {
    const total = state.apPoints.length;
    setBusyText(t('actuation.writingProgress', { percent: 90, done: total, total }));
    const result = await snapshot.client.writeActuationPoints(state.apProfile, state.apPoints, property);
    state.apDirty = false;
    state.notice = result.ok
      ? { kind: 'ok', text: t('actuation.verify.ok') }
      : { kind: 'warn', text: t('actuation.verify.fail', { count: result.mismatches.length }) };
  });
}

/* --------------------------------------------------------------- lighting */

function renderLighting(): HTMLElement {
  const snapshot = connected();
  if (!snapshot) return renderNeedConnection();

  const ledSection = h(
    'section',
    null,
    h('h3', { text: t('lighting.led') }),
    h(
      'label',
      { class: 'field-row' },
      h('input', {
        type: 'checkbox',
        checked: state.led.enable,
        disabled: !state.ledLoaded,
        onchange: (event: Event) => {
          state.led.enable = (event.currentTarget as HTMLInputElement).checked;
        },
      }),
      h('span', { text: t('lighting.led.enable') }),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { text: `${t('lighting.brightness')}: ${state.led.brightness}` }),
      h('input', {
        type: 'range',
        min: '0',
        max: '255',
        value: String(state.led.brightness),
        disabled: !state.ledLoaded,
        oninput: (event: Event) => {
          state.led.brightness = Number((event.currentTarget as HTMLInputElement).value);
          const label = (event.currentTarget as HTMLInputElement).previousElementSibling;
          if (label) label.textContent = `${t('lighting.brightness')}: ${state.led.brightness}`;
        },
      }),
    ),
    h('button', {
      type: 'button',
      text: t('lighting.ledWrite'),
      disabled: !state.ledLoaded,
      onclick: () => void writeLed(),
    }),
  );

  const modeSelect = h(
    'select',
    {
      disabled: !state.ltLoaded,
      onchange: (event: Event) => {
        state.ltMode = Number((event.currentTarget as HTMLSelectElement).value);
        if (state.ltParams) state.ltParams[LIGHTING_MODE_OFFSET] = state.ltMode;
      },
    },
    ...Object.entries(LIGHTING_MODE_LABELS).map(([value, labels]) =>
      h('option', {
        value,
        selected: Number(value) === state.ltMode,
        text: labels[getLang()],
      }),
    ),
  );

  const lightingSection = h(
    'section',
    null,
    h(
      'div',
      { class: 'field-row' },
      h('label', { class: 'small muted', text: t('lighting.profile') }),
      h(
        'select',
        {
          onchange: (event: Event) => {
            void loadLighting(Number((event.currentTarget as HTMLSelectElement).value));
          },
        },
        ...Array.from({ length: PROFILE_COUNT }, (_, index) =>
          h('option', { value: String(index), selected: index === state.ltProfile, text: profileLabel(index) }),
        ),
      ),
      h('button', {
        type: 'button',
        class: 'primary',
        text: t('lighting.read'),
        onclick: () => void loadLighting(state.ltProfile),
      }),
    ),
    h('div', { class: 'field' }, h('label', { text: t('lighting.mode') }), modeSelect),
    h('p', { class: 'small muted', text: t('lighting.modeNote') }),
    h('h3', { text: t('lighting.indicators') }),
    ...renderIndicatorFields(),
    h('button', {
      type: 'button',
      class: 'primary',
      text: t('lighting.write'),
      disabled: !state.ltLoaded,
      onclick: () => void writeLighting(),
    }),
  );

  const children: Child[] = [h('h2', { text: t('lighting.title') })];
  if (!state.ledLoaded && !state.ltLoaded) {
    children.push(h('p', { class: 'notice', text: t('lighting.notLoaded') }));
  }
  children.push(ledSection, lightingSection);
  return h('div', { class: 'card' }, ...children) as HTMLElement;
}

function renderIndicatorFields(): Child[] {
  if (!state.ltParams) return [h('p', { class: 'muted', text: t('lighting.notLoaded') })];
  const params = state.ltParams;
  return LIGHTING_INDICATORS.map((indicator) => {
    const r = params[indicator.offset] ?? 0;
    const g = params[indicator.offset + 1] ?? 0;
    const b = params[indicator.offset + 2] ?? 0;
    const a = params[indicator.offset + 3] ?? 0;
    const color = h('input', {
      type: 'color',
      value: rgbToHex(r, g, b),
      oninput: (event: Event) => {
        const [nr, ng, nb] = hexToRgb((event.currentTarget as HTMLInputElement).value);
        params[indicator.offset] = nr;
        params[indicator.offset + 1] = ng;
        params[indicator.offset + 2] = nb;
      },
    });
    const alpha = h('input', {
      type: 'range',
      min: '0',
      max: '255',
      value: String(a),
      oninput: (event: Event) => {
        params[indicator.offset + 3] = Number((event.currentTarget as HTMLInputElement).value);
      },
    });
    return h(
      'div',
      { class: 'field' },
      h('label', { text: t(`lighting.indicator.${indicator.key}`) }),
      h('div', { class: 'field-row' }, color, alpha, h('span', { class: 'small muted', text: t('lighting.alpha') })),
    );
  });
}

async function loadLighting(profile: number): Promise<void> {
  const snapshot = connected();
  if (!snapshot) return;
  await withBusy(t('common.busy'), async () => {
    state.ltParams = await snapshot.client.lightingGet(profile);
    state.ltProfile = profile;
    state.ltLoaded = true;
    state.ltMode = state.ltParams[LIGHTING_MODE_OFFSET] ?? 0;
    state.led = await snapshot.client.rgbLedConfigGet();
    state.ledLoaded = true;
  });
}

async function writeLed(): Promise<void> {
  const snapshot = connected();
  if (!snapshot || !window.confirm(t('lighting.confirmLed'))) return;
  await withBusy(t('lighting.writing'), async () => {
    const result = await snapshot.client.writeRgbLedConfig({ ...state.led });
    state.notice = result.ok
      ? { kind: 'ok', text: t('lighting.verify.ok') }
      : { kind: 'warn', text: t('lighting.verify.fail', { count: result.mismatches.length }) };
  });
}

async function writeLighting(): Promise<void> {
  const snapshot = connected();
  if (!snapshot || !state.ltParams) return;
  if (!window.confirm(t('lighting.confirm', { profile: profileLabel(state.ltProfile) }))) return;
  await withBusy(t('lighting.writing'), async () => {
    const params = state.ltParams!.slice();
    params[LIGHTING_MODE_OFFSET] = state.ltMode;
    const result = await snapshot.client.writeLighting(state.ltProfile, params);
    state.notice = result.ok
      ? { kind: 'ok', text: t('lighting.verify.ok') }
      : { kind: 'warn', text: t('lighting.verify.fail', { count: result.mismatches.length }) };
  });
}

/* ----------------------------------------------------------------- backup */

function renderBackup(): HTMLElement {
  const snapshot = connected();
  if (!snapshot) return renderNeedConnection();
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    onchange: (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void restoreFromFile(file);
    },
  });
  return h(
    'div',
    { class: 'card' },
    h('h2', { text: t('backup.title') }),
    h('p', { class: 'muted', text: t('backup.body') }),
    h(
      'div',
      { class: 'button-row' },
      h('button', {
        type: 'button',
        class: 'primary',
        text: t('backup.download'),
        onclick: () => void downloadBackup(),
      }),
    ),
    h('div', { class: 'field' }, h('label', { text: t('backup.file') }), fileInput),
    h('p', { class: 'small muted', text: t('backup.restore') }),
  ) as HTMLElement;
}

function renderNeedConnection(): HTMLElement {
  return h(
    'div',
    { class: 'card' },
    h('p', { class: 'notice', text: t('backup.noDevice') }),
    h('button', {
      type: 'button',
      text: t('tab.connect'),
      onclick: () => {
        state.tab = 'connect';
        render();
      },
    }),
  ) as HTMLElement;
}

async function downloadBackup(): Promise<void> {
  const snapshot = connected();
  if (!snapshot) return;
  await withBusy(t('backup.busy'), async () => {
    const backup = await snapshot.client.makeBackup(snapshot.identity);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = h('a', {
      href: url,
      download: `zenaim-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    state.notice = { kind: 'ok', text: t('backup.done') };
  });
}

function isBackup(value: unknown): value is Backup {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Backup).format === 'unofficial-zenaim-util/backup'
  );
}

async function restoreFromFile(file: File): Promise<void> {
  const snapshot = connected();
  if (!snapshot) return;
  let backup: Backup;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!isBackup(parsed)) throw new Error('unrecognised backup format');
    backup = parsed;
  } catch {
    state.notice = { kind: 'error', text: t('backup.error') };
    render();
    return;
  }
  if (!window.confirm(t('backup.confirm'))) return;

  await withBusy(t('backup.restoring'), async () => {
    const currentModel = snapshot.identity.keyboardInfo.modelName;
    if (backup.device.modelName && backup.device.modelName !== currentModel) {
      state.notice = {
        kind: 'warn',
        text: t('backup.mismatch', { backup: backup.device.modelName, current: currentModel }),
      };
    }
    if (backup.rgbLedConfig) {
      await snapshot.client.writeRgbLedConfig(backup.rgbLedConfig);
      state.led = { ...backup.rgbLedConfig };
      state.ledLoaded = true;
    }
    if (Array.isArray(backup.lighting)) {
      // Ignore profiles the protocol does not define instead of writing past the
      // documented 0..PROFILE_COUNT-1 range.
      const profiles = Math.min(backup.lighting.length, PROFILE_COUNT);
      for (let profile = 0; profile < profiles; profile++) {
        const params = backup.lighting[profile];
        if (!params || params.length !== LIGHTING_PARAMS_SIZE) continue;
        setBusyText(`${t('backup.restoring')} (lighting ${profile + 1})`);
        await snapshot.client.writeLighting(profile, Uint8Array.from(params));
      }
    }
    const property = snapshot.identity.property;
    if (property && Array.isArray(backup.actuationPoints)) {
      for (const dump of backup.actuationPoints) {
        if (!dump?.points || dump.points.length !== property.keyCount) continue;
        if (!Number.isInteger(dump.profile) || dump.profile < 0 || dump.profile >= PROFILE_COUNT) {
          continue;
        }
        setBusyText(`${t('backup.restoring')} (actuation ${dump.profile + 1})`);
        await snapshot.client.writeActuationPoints(dump.profile, dump.points, property);
      }
    }
    if (typeof backup.actuationEnable === 'boolean') {
      await snapshot.client.actuationEnableSet(backup.actuationEnable);
      state.apEnabled = backup.actuationEnable;
    }
    state.notice = { kind: 'ok', text: t('backup.done') };
  });
}

/* ---------------------------------------------------------------- render */

function render(): void {
  applyI18n(document);
  clear(root);
  root.append(renderTabs());
  if (state.notice) {
    root.append(h('p', { class: `notice ${state.notice.kind}`, text: state.notice.text }));
  }
  switch (state.tab) {
    case 'actuation':
      root.append(renderActuation());
      break;
    case 'lighting':
      root.append(renderLighting());
      break;
    case 'backup':
      root.append(renderBackup());
      break;
    default:
      root.append(renderConnectPanel());
  }
  renderOverlay();
}

connection.subscribe((snapshot) => {
  state.notice = null;
  if (snapshot.kind !== 'connected') {
    state.apLoaded = false;
    state.ledLoaded = false;
    state.ltLoaded = false;
    state.ltParams = null;
    state.apPoints = [];
    state.apSelected = null;
    state.tab = 'connect';
  }
  render();
});

onLangChange(render);

// `?demo=1` opens the configurator in demo mode (used by the landing page).
const params = new URLSearchParams(window.location.search);
if (params.has('demo')) {
  void connection.connectDemo().then(render);
}

render();
