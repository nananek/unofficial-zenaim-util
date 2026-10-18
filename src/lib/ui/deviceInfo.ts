import type { DeviceIdentity } from '../protocol/client';
import { h, toHex, type Child } from './dom';
import { t } from './i18n';

/** Rows for the device information table, shared by the landing and config pages. */
export function deviceInfoRows(identity: DeviceIdentity, transportLabel: string): Array<[string, string]> {
  const property = identity.property;
  const unknown = t('device.unknown');
  const rows: Array<[string, string]> = [
    [t('device.name'), identity.keyboardInfo.deviceName || unknown],
    [t('device.model'), identity.keyboardInfo.modelName || unknown],
    [t('device.serial'), identity.keyboardInfo.serialNumber || unknown],
    [t('device.firmware'), identity.firmwareVersion || unknown],
    [t('device.protocol'), `v${identity.protocolVersion}`],
    [t('device.transport'), transportLabel],
    [
      t('device.usb'),
      `0x${toHex(identity.usb.vendorId, 4)}:0x${toHex(identity.usb.productId, 4)}`,
    ],
  ];
  if (identity.usb.bcdDevice !== undefined) {
    rows.push([t('device.revision'), `0x${toHex(identity.usb.bcdDevice, 4)}`]);
  }
  rows.push([t('device.series'), property?.series ?? unknown]);
  if (property) {
    rows.push([t('device.keys'), String(property.keyCount)]);
    rows.push([t('device.matrix'), `${property.rows}×${property.columns}`]);
    rows.push([t('device.temperature'), String(property.temperatureCount)]);
    rows.push([t('device.adc'), String(property.adcCount)]);
    rows.push([t('device.reference'), `${property.referenceVoltage} mV`]);
    rows.push([t('device.travel'), `${property.actuationDistance} µm`]);
  }
  return rows;
}

export function renderDeviceInfo(identity: DeviceIdentity, transportLabel: string): HTMLElement {
  const body = h(
    'tbody',
    null,
    ...deviceInfoRows(identity, transportLabel).map(([label, value]) =>
      h('tr', null, h('th', { text: label }), h('td', { class: 'mono', text: value })),
    ),
  );
  const children: Child[] = [h('h2', { text: t('device.title') }), h('table', null, body)];
  if (identity.ambiguous) {
    children.push(h('p', { class: 'notice warn', text: t('device.ambiguous') }));
  }
  return h('div', { class: 'card', id: 'device-info' }, ...children) as HTMLElement;
}
