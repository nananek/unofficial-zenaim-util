/**
 * Command IDs from docs/protocol.md §3 (protocol v2).
 *
 * Only the commands the configurator actually uses are given a semantic entry;
 * the full ID space is listed so that raw listeners and error messages can name
 * what they see.
 */
export const Cmd = {
  // §3.1 System
  ProtocolVersionGet: 0x30,
  FirmwareVersionGet: 0x31,
  BootloaderEnter: 0x32,
  FactoryReset: 0x33,
  Reboot: 0x34,
  ADCAllGet: 0x35,
  EEPROMGet: 0x36,
  EEPROMSet: 0x37,
  EEPROMErase: 0x38,
  SwitchMatrixState: 0x39,

  // §3.2 Keyboard info
  KeyboardInfoGet: 0x40,
  KeyboardInfoSet: 0x41,
  KeyboardInfoHashGet: 0x42,
  KeyboardInfoApply: 0x43,
  KeyboardInfoLoad: 0x44,
  KeyboardInfoSave: 0x45,

  // §3.3 Actuation enable
  ActuationEnableGet: 0x46,
  ActuationEnableSet: 0x47,

  // §3.4 Actuation point [profile]
  ActuationPointGet: 0x48,
  ActuationPointSet: 0x49,
  ActuationPointAllGet: 0x4a,
  ActuationPointAllSet: 0x4b,
  ActuationPointHashGet: 0x4c,
  ActuationPointApply: 0x4d,
  ActuationPointLoad: 0x4e,
  ActuationPointSave: 0x4f,
  ActuationPointDefaultLoad: 0x50,
  ActuationPointDefaultSave: 0x51,

  // §3.8 Keymap [profile]
  KeymapGet: 0x6e,
  KeymapSet: 0x6f,
  KeymapAllGet: 0x70,
  KeymapAllSet: 0x71,
  KeymapHashGet: 0x72,
  KeymapApply: 0x73,
  KeymapLoad: 0x74,
  KeymapSave: 0x75,

  // §3.9 Macro [profile]
  MacroGet: 0x78,
  MacroSet: 0x79,

  // §3.10 RGB lighting [profile]
  RGBLightingGet: 0x80,
  RGBLightingSet: 0x81,
  RGBLightingHashGet: 0x82,
  RGBLightingApply: 0x83,
  RGBLightingLoad: 0x84,
  RGBLightingSave: 0x85,
  RGBLightingDefaultLoad: 0x86,
  RGBLightingDefaultSave: 0x87,

  // §3.11 User info
  UserInfoHashGet: 0x8c,

  // §3.12 Profile info
  ProfileInfoGet: 0x90,
  ProfileInfoSet: 0x91,

  // §3.14 RGB LED config
  RGBLEDConfigGet: 0x98,
  RGBLEDConfigSet: 0x99,
  RGBLEDConfigHashGet: 0x9a,
  RGBLEDConfigApply: 0x9b,
  RGBLEDConfigLoad: 0x9c,
  RGBLEDConfigSave: 0x9d,
  RGBLEDConfigDefaultLoad: 0x9e,
  RGBLEDConfigDefaultSave: 0x9f,

  // §3.15 Profile select
  ProfileSelectGet: 0xa0,
  ProfileSelectSet: 0xa1,

  // §3.16 Alert config
  AlertConfigGet: 0xa6,
  AlertConfigSet: 0xa7,

  // §3.17 Logging config
  LoggingConfigGet: 0xae,
  LoggingConfigSet: 0xaf,

  // §3.20 Actuation distance with switch state (read-only live samples)
  ActuationDistanceWithSwitchStateAllGet: 0xcb,

  // §3.22 Actuation user config (protocol v2+)
  ActuationUserConfigGet: 0xd4,
  ActuationUserConfigSet: 0xd5,
  ActuationUserConfigHashGet: 0xd6,
  ActuationUserConfigApply: 0xd7,
  ActuationUserConfigLoad: 0xd8,
  ActuationUserConfigSave: 0xd9,

  // §3.25 reserved / errors
  Error: 0xfe,
  Unhandled: 0xff,
} as const;

export type CommandId = (typeof Cmd)[keyof typeof Cmd];

const NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(Cmd).map(([name, id]) => [id, name]),
);

/** Human readable name for a command ID, for logs and error messages. */
export function commandName(id: number): string {
  return NAMES[id] ?? `unknown(0x${id.toString(16).padStart(2, '0')})`;
}
