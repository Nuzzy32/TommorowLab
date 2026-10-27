export const VERSIONS = {
  schemaVersion: 1,
  modelVersion: 'canteen-fifo-v1',
  engineVersion: 'des-ts-v1',
  rngVersion: 'pcg32-xsh-rr-v1',
  seedDerivationVersion: 'seed-pcg32-v1',
  protocolVersion: 1,
} as const;

export const MAX_CUSTOMERS = 2000;
const MAX_PAYLOAD_BYTES = 100 * 1024;

export type ManualEntry = {
  id: string;
  atSimSec: number;
  count: number;
  sequence: number;
  customerOrdinals: number[];
};

export type ScenarioConfig = {
  id: string;
  name: string;
  schemaVersion: 1;
  modelVersion: typeof VERSIONS.modelVersion;
  c: number;
  lambdaPerMinute: number;
  serviceMinSec: number;
  serviceMaxSec: number;
  horizonSec: number;
  rootSeed: number;
  manualSchedule: ManualEntry[];
};

export const DEFAULT_CONFIG: ScenarioConfig = {
  id: 'lunch', name: 'Jam makan siang',
  schemaVersion: 1, modelVersion: VERSIONS.modelVersion,
  c: 2, lambdaPerMinute: 4, serviceMinSec: 20, serviceMaxSec: 40,
  horizonSec: 900, rootSeed: 2026, manualSchedule: [],
};

export type ValidationIssue = { field: string; message: string };

export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map(({ field, message }) => `${field}: ${message}`).join('; '));
    this.name = 'ValidationError';
  }
}

function fail(field: string, message: string): never {
  throw new ValidationError([{ field, message }]);
}

// Bound serialized input before copying it or allocating a simulation runtime.
function checkPayload(input: unknown): void {
  let bytes = 0;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  function add(amount: number) {
    bytes += amount;
    if (bytes > MAX_PAYLOAD_BYTES) fail('payload', 'Ukuran data maksimal 100 KB.');
  }
  function visit(value: unknown, depth: number): void {
    if (depth > 20) fail('payload', 'Struktur data terlalu dalam.');
    if (typeof value === 'string') {
      if (value.length > MAX_PAYLOAD_BYTES) fail('payload', 'Ukuran data maksimal 100 KB.');
      add(encoder.encode(JSON.stringify(value)).length);
    } else if (value === undefined) {
      add(4);
    } else if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      add(String(value).length);
    } else if (typeof value === 'object') {
      if (ancestors.has(value)) fail('payload', 'Data tidak boleh memiliki referensi melingkar.');
      ancestors.add(value);
      add(2);
      if (Array.isArray(value)) {
        if (value.length > MAX_PAYLOAD_BYTES) fail('payload', 'Ukuran data maksimal 100 KB.');
        for (let index = 0; index < value.length; index++) {
          if (index > 0) add(1);
          visit(value[index], depth + 1);
        }
      } else {
        let first = true;
        for (const [key, item] of Object.entries(value)) {
          if (!first) add(1);
          first = false;
          visit(key, depth + 1); add(1); visit(item, depth + 1);
        }
      }
      ancestors.delete(value);
    } else {
      fail('payload', 'Data harus berupa nilai JSON yang sah.');
    }
  }
  visit(input, 0);
}

function record(input: unknown, field: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    fail(field, 'Harus berupa objek.');
  }
  return input as Record<string, unknown>;
}

function textValue(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) fail(field, 'Teks wajib diisi.');
  return input;
}

function numeric(input: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof input !== 'number' || !Number.isFinite(input)
    || input < min || input > max || (integer && !Number.isSafeInteger(input))) {
    fail(field, `Harus berupa ${integer ? 'bilangan bulat' : 'angka finite'} antara ${min} dan ${max}.`);
  }
  return input;
}

function manualSchedule(input: unknown, horizonSec: number): ManualEntry[] {
  numeric(horizonSec, 'horizonSec', 60, 1800);
  if (!Array.isArray(input)) fail('manualSchedule', 'Harus berupa daftar entry manual.');
  if (input.length > MAX_CUSTOMERS) fail('manualSchedule', 'Jumlah pelanggan manual maksimal 2.000.');
  const ids = new Set<string>();
  const sequences = new Set<number>();
  const ordinals = new Set<number>();
  let total = 0;
  return Array.from(input, (value, index) => {
    const field = `manualSchedule.${index}`;
    const entry = record(value, field);
    const id = textValue(entry.id, `${field}.id`);
    if (ids.has(id)) fail(`${field}.id`, 'ID entry harus unik.');
    ids.add(id);
    const atSimSec = numeric(entry.atSimSec, `${field}.atSimSec`, 0, horizonSec);
    if (atSimSec === horizonSec) fail(`${field}.atSimSec`, 'Waktu harus lebih kecil dari horizon.');
    const count = numeric(entry.count, `${field}.count`, 1, 20, true);
    total += count;
    if (total > MAX_CUSTOMERS) fail('manualSchedule', 'Jumlah pelanggan manual maksimal 2.000.');
    const sequence = numeric(entry.sequence, `${field}.sequence`, 0, Number.MAX_SAFE_INTEGER, true);
    if (sequences.has(sequence)) fail(`${field}.sequence`, 'Sequence harus unik.');
    sequences.add(sequence);
    if (!Array.isArray(entry.customerOrdinals) || entry.customerOrdinals.length !== count) {
      fail(`${field}.customerOrdinals`, 'Jumlah ordinal harus sama dengan count.');
    }
    const customerOrdinals = Array.from(entry.customerOrdinals, (ordinal: unknown, position: number) => {
      const ordinalField = `${field}.customerOrdinals.${position}`;
      const valid = numeric(ordinal, ordinalField, 0, MAX_CUSTOMERS - 1, true);
      if (ordinals.has(valid)) fail(ordinalField, 'Ordinal pelanggan harus unik.');
      ordinals.add(valid);
      return valid;
    });
    return { id, atSimSec, count, sequence, customerOrdinals };
  });
}

export function validateManualSchedule(input: unknown, horizonSec: number): ManualEntry[] {
  checkPayload(input);
  return manualSchedule(input, horizonSec);
}

export function validateConfig(input: unknown): ScenarioConfig {
  checkPayload(input);
  const config = record(input, 'config');
  const id = textValue(config.id, 'id');
  const name = textValue(config.name, 'name').trim();
  if (name.length > 60) fail('name', 'Nama maksimal 60 karakter setelah trim.');
  if (config.schemaVersion !== VERSIONS.schemaVersion) fail('schemaVersion', 'Versi schema tidak didukung.');
  if (config.modelVersion !== VERSIONS.modelVersion) fail('modelVersion', 'Versi model tidak didukung.');
  const c = numeric(config.c, 'c', 1, 6, true);
  const lambdaPerMinute = numeric(config.lambdaPerMinute, 'lambdaPerMinute', 0, 20);
  const serviceMinSec = numeric(config.serviceMinSec, 'serviceMinSec', 1, 300, true);
  const serviceMaxSec = numeric(config.serviceMaxSec, 'serviceMaxSec', serviceMinSec, 300, true);
  const horizonSec = numeric(config.horizonSec, 'horizonSec', 60, 1800);
  const rootSeed = numeric(config.rootSeed, 'rootSeed', 0, 0xffff_ffff, true);
  return {
    id, name, schemaVersion: 1, modelVersion: VERSIONS.modelVersion,
    c, lambdaPerMinute, serviceMinSec, serviceMaxSec, horizonSec, rootSeed,
    manualSchedule: manualSchedule(config.manualSchedule, horizonSec),
  };
}

export function appendManualEntry(schedule: ManualEntry[], horizonSec: number, atSimSec: number, count: number): {
  entry: ManualEntry; schedule: ManualEntry[];
} {
  const copied = validateManualSchedule(schedule, horizonSec);
  numeric(count, 'count', 1, 20, true);
  numeric(atSimSec, 'atSimSec', 0, horizonSec);
  if (atSimSec === horizonSec) fail('atSimSec', 'Waktu harus lebih kecil dari horizon.');
  const used = new Set(copied.flatMap((entry) => entry.customerOrdinals));
  if (used.size + count > MAX_CUSTOMERS) fail('count', 'Jumlah pelanggan manual maksimal 2.000.');
  const sequence = copied.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
  numeric(sequence, 'sequence', 0, Number.MAX_SAFE_INTEGER, true);
  const customerOrdinals: number[] = [];
  for (let ordinal = 0; customerOrdinals.length < count; ordinal++) {
    if (!used.has(ordinal)) customerOrdinals.push(ordinal);
  }
  const ids = new Set(copied.map((entry) => entry.id));
  let id = `manual:${sequence}`;
  while (ids.has(id)) id += ':';
  const entry = { id, atSimSec, count, sequence, customerOrdinals };
  const combined = [...copied, entry];
  checkPayload(combined);
  return { entry, schedule: combined };
}

export function promoteManualLog(config: ScenarioConfig, inputLog: ManualEntry[]): ScenarioConfig {
  if (!Array.isArray(config.manualSchedule) || !Array.isArray(inputLog)) {
    fail('manualSchedule', 'Jadwal dan input log harus berupa daftar.');
  }
  if (config.manualSchedule.length + inputLog.length > MAX_CUSTOMERS) {
    fail('manualSchedule', 'Jumlah pelanggan manual maksimal 2.000.');
  }
  return validateConfig({ ...config, manualSchedule: [...config.manualSchedule, ...inputLog] });
}
