/** Protocol enumerations and their display labels (docs/protocol.md §4). */

export const PROFILE_COUNT = 5;

export const Profile = {
  Base: 0,
  Temporary: 1,
  Memory1: 2,
  Memory2: 3,
  Memory3: 4,
} as const;

export const PROFILE_LABELS: Record<number, { ja: string; en: string }> = {
  [Profile.Base]: { ja: 'Base', en: 'Base' },
  [Profile.Temporary]: { ja: 'Temporary', en: 'Temporary' },
  [Profile.Memory1]: { ja: 'Memory 1', en: 'Memory 1' },
  [Profile.Memory2]: { ja: 'Memory 2', en: 'Memory 2' },
  [Profile.Memory3]: { ja: 'Memory 3', en: 'Memory 3' },
};

export const LightingMode = {
  MONO: 0,
  WAVE: 1,
  WARP: 2,
  CHASE: 3,
  BREATHE: 4,
  MANUAL: 5,
  REACTIVE: 6,
} as const;

export const LIGHTING_MODE_LABELS: Record<number, { ja: string; en: string }> = {
  [LightingMode.MONO]: { ja: '単色 (MONO)', en: 'MONO' },
  [LightingMode.WAVE]: { ja: '波 (WAVE)', en: 'WAVE' },
  [LightingMode.WARP]: { ja: 'ワープ (WARP)', en: 'WARP' },
  [LightingMode.CHASE]: { ja: 'チェース (CHASE)', en: 'CHASE' },
  [LightingMode.BREATHE]: { ja: 'ブレーズ (BREATHE)', en: 'BREATHE' },
  [LightingMode.MANUAL]: { ja: '自由設定 (MANUAL)', en: 'MANUAL' },
  [LightingMode.REACTIVE]: { ja: '反応 (REACTIVE)', en: 'REACTIVE' },
};

/** Lighting params layout inside the 512-byte block (docs/protocol.md §3.10). */
export const LIGHTING_PARAMS_SIZE = 512;
export const LIGHTING_MODE_OFFSET = 28;

/** The five indicator RGBA slots at the head of the params block. */
export const LIGHTING_INDICATORS = [
  { key: 'mem1', offset: 0 },
  { key: 'mem2', offset: 4 },
  { key: 'mem3', offset: 8 },
  { key: 'keyDisable', offset: 12 },
  { key: 'capsLock', offset: 16 },
] as const;

export type LightingIndicatorKey = (typeof LIGHTING_INDICATORS)[number]['key'];
