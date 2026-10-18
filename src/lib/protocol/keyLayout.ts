/**
 * Key layout of the ZK1 80US series.
 *
 * The device addresses keys by their position in the 6×18 row-major matrix
 * (device index 0..107). Nineteen of those positions are extra increments
 * around the wide keys and hold no key, so a device index maps either to a key
 * name or to `null`. Esc is device index 0 and Space is device index 96; both
 * were confirmed on hardware.
 */

import type { DeviceProperty } from './deviceProperties';

interface AppKeyRun {
  /** First app key index of the run. */
  start: number;
  /** Last app key index of the run (inclusive). */
  end: number;
  /** Device positions after the run that belong to no key. */
  space: number;
}

/**
 * Runs of consecutive app key indices and the device positions they occupy.
 * The device cursor starts at 0: each run assigns one position per app key,
 * then its `space` positions are left without a key.
 */
const APP_KEY_RUNS: readonly AppKeyRun[] = [
  { start: 0, end: 30, space: 1 },
  { start: 31, end: 35, space: 1 },
  { start: 36, end: 52, space: 1 },
  { start: 53, end: 63, space: 1 },
  { start: 64, end: 64, space: 3 },
  { start: 65, end: 65, space: 1 },
  { start: 66, end: 75, space: 1 },
  { start: 76, end: 76, space: 2 },
  { start: 77, end: 77, space: 1 },
  { start: 78, end: 80, space: 3 },
  { start: 81, end: 81, space: 3 },
  { start: 82, end: 84, space: 1 },
  { start: 85, end: 88, space: 0 },
];

/** Key names in app key index order (0..88). */
const APP_KEY_NAMES = [
  // index 0-17
  'Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'lock', 'clip', 'mem1', 'mem2', 'mem3',
  // index 18-31
  'E/J', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '~', 'BS',
  // index 32-34
  'Ins', 'Home', 'PgUp',
  // index 35-48
  'TAB', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '[', ']',
  // index 49-51
  'Del', 'End', 'PgDn',
  // index 52-64
  'Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ':', 'ENTER',
  // index 65-77
  'SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'RSHIFT', '↑',
  // index 78-88
  'Ctrl', 'Win', 'Alt', 'Space', 'RAlt', 'Zenaim', 'Menu', 'RCtrl', '←', '↓', '→',
] as const;

/**
 * Device index → key name for the ZK1 80US series; positions without a key are
 * `null`. Returns `null` for other series so the UI keeps the matrix-position
 * fallback.
 */
export function deviceKeyNames(property: DeviceProperty): (string | null)[] | null {
  if (property.series !== 'ZK1 80US') return null;

  const names: (string | null)[] = [];
  let cursor = 0;
  for (const run of APP_KEY_RUNS) {
    for (let appIndex = run.start; appIndex <= run.end; appIndex++) {
      names[cursor] = APP_KEY_NAMES[appIndex] ?? null;
      cursor++;
    }
    for (let skipped = 0; skipped < run.space; skipped++) {
      names[cursor] = null;
      cursor++;
    }
  }

  // Layout anchors: 0 Esc, 31 no key, 68 ENTER, 72 SHIFT, 85 RSHIFT, 96 Space
  // (19 unnamed positions in total). Reject a map that misses the matrix size.
  if (names.length !== property.keyCount) return null;
  return names;
}
