/**
 * `deviceProperty` table — the per-model configuration values from
 * docs/protocol.md §5. The firmware resolves these from USB identity plus
 * `modelName`; the configurator has to reproduce the same lookup so that it can
 * size every buffer correctly.
 */

export interface DeviceProperty {
  /** Marketing / series name, e.g. "ZK1 80US". */
  series: string;
  /** Exact `modelName` reported by KeyboardInfoGet (§3.2). */
  modelName: string;
  /** USB product ID (VID is 0x3507 for every entry). */
  productId: number;
  /** USB bcdDevice, i.e. the hardware revision. */
  bcdDevice: number;
  rows: number;
  columns: number;
  keyCount: number;
  temperatureCount: number;
  adcCount: number;
  /** Excitation / supply voltage in mV. */
  powerVoltage: number;
  /** ADC reference voltage in mV (differs per revision — see §3.13). */
  referenceVoltage: number;
  /** ADC resolution as the number of steps (12 bit → 4096). */
  resolutionStep: number;
  /** Full actuation travel in µm. */
  actuationDistance: number;
  /** Factory default actuation point (Normal type) in µm. */
  initialNormal: { pointOn: number; pointOff: number };
  /** Factory default MotionHack parameters. */
  initialMotionHack: {
    range: number;
    strokeOn: number;
    strokeOff: number;
    beyondMode: boolean;
  };
}

export const ZENAIM_VENDOR_ID = 0x3507;
/** usagePage / usage of interface 1, the interface this protocol lives on (§1.2). */
export const ZENAIM_USAGE_PAGE = 0xff60;
export const ZENAIM_USAGE = 0x61;

type PropertySeed = Pick<
  DeviceProperty,
  'series' | 'modelName' | 'productId' | 'bcdDevice' | 'rows' | 'columns' | 'temperatureCount'
> & {
  /** Reference voltage in mV; everything else is derived below. */
  referenceVoltage: number;
  /** Actuation travel in µm. */
  actuationDistance: number;
  initialNormal: [pointOn: number, pointOff: number];
  initialMotionHack: [range: number, strokeOn: number, strokeOff: number];
};

const KEYBOARD_80 = { referenceVoltage: 2900, actuationDistance: 1800, initialNormal: [1500, 1300] as [number, number] };
const MOTION_HACK_80: [number, number, number] = [500, 1000, 200];

/**
 * Ordered oldest → newest; the resolver prefers later (newer hardware
 * revision) entries when several share the same USB identity (§5).
 */
const SEEDS: PropertySeed[] = [
  { series: 'ZK1 80US', modelName: 'KB007-DGBK', productId: 0x0003, bcdDevice: 0x0100, rows: 6, columns: 18, temperatureCount: 6, referenceVoltage: 2048, actuationDistance: 1800, initialNormal: [1500, 1300], initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 80US', modelName: 'KB011-DGBK', productId: 0x0003, bcdDevice: 0x0101, rows: 6, columns: 18, temperatureCount: 6, referenceVoltage: 2048, actuationDistance: 1800, initialNormal: [1500, 1300], initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 80US', modelName: 'KB011-DGBK', productId: 0x0003, bcdDevice: 0x0102, rows: 6, columns: 18, temperatureCount: 6, ...KEYBOARD_80, initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 80JIS', modelName: 'KB006-DGBK', productId: 0x0002, bcdDevice: 0x0100, rows: 6, columns: 18, temperatureCount: 6, referenceVoltage: 2048, actuationDistance: 1800, initialNormal: [1500, 1300], initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 80JIS', modelName: 'KB010-DGBK', productId: 0x0002, bcdDevice: 0x0101, rows: 6, columns: 18, temperatureCount: 6, referenceVoltage: 2048, actuationDistance: 1800, initialNormal: [1500, 1300], initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 80JIS', modelName: 'KB010-DGBK', productId: 0x0002, bcdDevice: 0x0102, rows: 6, columns: 18, temperatureCount: 6, ...KEYBOARD_80, initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 60JIS', modelName: 'KB008-DGBK', productId: 0x0005, bcdDevice: 0x0100, rows: 5, columns: 15, temperatureCount: 6, ...KEYBOARD_80, initialMotionHack: MOTION_HACK_80 },
  { series: 'ZK1 60US', modelName: 'KB009-DGBK', productId: 0x0006, bcdDevice: 0x0100, rows: 5, columns: 15, temperatureCount: 6, ...KEYBOARD_80, initialMotionHack: MOTION_HACK_80 },
  { series: '19Key', modelName: 'AC001-BKBK', productId: 0x000b, bcdDevice: 0x0100, rows: 3, columns: 19, temperatureCount: 19, referenceVoltage: 2900, actuationDistance: 650, initialNormal: [400, 100], initialMotionHack: [100, 200, 300] },
  { series: '19Key Module', modelName: 'AC002-BKBK', productId: 0x0004, bcdDevice: 0x0100, rows: 3, columns: 19, temperatureCount: 19, referenceVoltage: 2900, actuationDistance: 650, initialNormal: [400, 100], initialMotionHack: [100, 200, 300] },
  { series: '19Key Module', modelName: 'AC002-BKBK', productId: 0x000b, bcdDevice: 0x0100, rows: 3, columns: 19, temperatureCount: 19, referenceVoltage: 2900, actuationDistance: 650, initialNormal: [400, 100], initialMotionHack: [100, 200, 300] },
];

function materialize(seed: PropertySeed): DeviceProperty {
  const keyCount = seed.rows * seed.columns;
  return {
    series: seed.series,
    modelName: seed.modelName,
    productId: seed.productId,
    bcdDevice: seed.bcdDevice,
    rows: seed.rows,
    columns: seed.columns,
    keyCount,
    temperatureCount: seed.temperatureCount,
    adcCount: keyCount + seed.temperatureCount,
    powerVoltage: 3300,
    referenceVoltage: seed.referenceVoltage,
    resolutionStep: 4096,
    actuationDistance: seed.actuationDistance,
    initialNormal: { pointOn: seed.initialNormal[0], pointOff: seed.initialNormal[1] },
    initialMotionHack: {
      range: seed.initialMotionHack[0],
      strokeOn: seed.initialMotionHack[1],
      strokeOff: seed.initialMotionHack[2],
      beyondMode: false,
    },
  };
}

/** The full table, oldest → newest (see §5). */
export const DEVICE_PROPERTIES: readonly DeviceProperty[] = SEEDS.map(materialize);

export interface UsbIdentity {
  vendorId: number;
  productId: number;
  /** Not exposed by WebHID; used when available (mock, native transports). */
  bcdDevice?: number;
  /** Filled in after KeyboardInfoGet. */
  modelName?: string;
}

/**
 * Resolve the candidate `deviceProperty` entries for a device.
 *
 * Mirrors §5: an exact `modelName` match wins; otherwise (or if `bcdDevice` is
 * unavailable, as it is over WebHID) the lookup falls back to USB identity only.
 * Candidates are returned oldest → newest so callers can pick the last one.
 */
export function resolveDeviceProperties(id: UsbIdentity): DeviceProperty[] {
  if (id.vendorId !== ZENAIM_VENDOR_ID) return [];

  const samePid = DEVICE_PROPERTIES.filter((p) => p.productId === id.productId);
  if (samePid.length === 0) return [];

  // 1. Exact modelName (+ revision when known).
  if (id.modelName) {
    const exact = samePid.filter(
      (p) =>
        p.modelName === id.modelName &&
        (id.bcdDevice === undefined || p.bcdDevice === id.bcdDevice),
    );
    if (exact.length > 0) return exact;
    const byName = samePid.filter((p) => p.modelName === id.modelName);
    if (byName.length > 0) return byName;
  }

  // 2. USB identity only (revision, then product id).
  const byRevision =
    id.bcdDevice === undefined ? [] : samePid.filter((p) => p.bcdDevice === id.bcdDevice);
  return byRevision.length > 0 ? byRevision : samePid;
}

/** Pick the newest candidate for a device, or `undefined` when unknown. */
export function pickDeviceProperty(id: UsbIdentity): DeviceProperty | undefined {
  const candidates = resolveDeviceProperties(id);
  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
}
