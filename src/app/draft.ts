import { appendManualEntry, DEFAULT_CONFIG, validateConfig, ValidationError } from '../domain/config';
import type { ManualEntry, ScenarioConfig } from '../domain/config';
import { formatClock as clock } from './format';

export type FieldName = 'c' | 'lambda' | 'serviceMin' | 'serviceMax' | 'horizonMin' | 'seed';
type EntryField = 'minute' | 'second' | 'count';
export type DraftErrors = Partial<Record<FieldName | 'entry' | 'schedule', string>>;
export type Draft = {
  fields: Record<FieldName, string>;
  schedule: ManualEntry[];
  entry: Record<EntryField, string>;
  errors: DraftErrors;
};

// Bounds mirror the domain validator; the UI rejects instead of clamping or rounding.
const RULES: Record<FieldName, { decimal?: true; min: number; max: number; message: string }> = {
  c: { min: 1, max: 6, message: 'Jumlah loket harus bilangan bulat 1–6.' },
  lambda: { decimal: true, min: 0, max: 20, message: 'Kedatangan otomatis harus angka 0–20 pelanggan/menit.' },
  serviceMin: { min: 1, max: 300, message: 'Waktu pelayanan minimum harus bilangan bulat 1–300 detik.' },
  serviceMax: { min: 1, max: 300, message: 'Waktu pelayanan maksimum harus bilangan bulat 1–300 detik.' },
  horizonMin: { min: 1, max: 30, message: 'Durasi menerima pelanggan harus bilangan bulat 1–30 menit.' },
  seed: { min: 0, max: 0xffff_ffff, message: 'Seed harus bilangan bulat 0–4294967295.' },
};
export const FIELD_ORDER: FieldName[] = ['c', 'lambda', 'serviceMin', 'serviceMax', 'horizonMin', 'seed'];

// One decimal separator (comma or dot) for decimals only; thousands separators are rejected.
export function parseNumber(text: string, decimal = false): number | null {
  const trimmed = text.trim();
  if (!(decimal ? /^\d+(?:[.,]\d+)?$/ : /^\d+$/).test(trimmed)) return null;
  return Number(trimmed.replace(',', '.'));
}

export function fieldValue(fields: Record<FieldName, string>, name: FieldName): number | null {
  const rule = RULES[name];
  const value = parseNumber(fields[name], rule.decimal);
  return value !== null && Number.isFinite(value) && value >= rule.min && value <= rule.max ? value : null;
}

function fieldErrors(fields: Record<FieldName, string>, names: FieldName[]): DraftErrors {
  const errors: DraftErrors = {};
  for (const name of names) {
    if (fieldValue(fields, name) === null) errors[name] = RULES[name].message;
  }
  const min = fieldValue(fields, 'serviceMin');
  const max = fieldValue(fields, 'serviceMax');
  if (names.includes('serviceMax') && !errors.serviceMax && min !== null && max !== null && max < min) {
    errors.serviceMax = 'Waktu maksimum harus ≥ minimum.';
  }
  return errors;
}

const formatDecimal = (value: number) => String(value).replace('.', ',');

export function configFields(config: ScenarioConfig): Record<FieldName, string> {
  return {
    c: String(config.c), lambda: formatDecimal(config.lambdaPerMinute),
    serviceMin: String(config.serviceMinSec), serviceMax: String(config.serviceMaxSec),
    horizonMin: String(config.horizonSec / 60), seed: String(config.rootSeed),
  };
}

export const initialDraft = (config: ScenarioConfig = DEFAULT_CONFIG): Draft => ({
  fields: configFields(config), schedule: config.manualSchedule, entry: { minute: '0', second: '0', count: '1' }, errors: {},
});

export const horizonSec = (fields: Record<FieldName, string>) => {
  const minutes = fieldValue(fields, 'horizonMin');
  return minutes === null ? null : minutes * 60;
};

export const outOfRange = (draft: Draft) => {
  const horizon = horizonSec(draft.fields);
  return horizon === null ? [] : draft.schedule.filter(entry => entry.atSimSec >= horizon);
};

export type DraftAction =
  | { type: 'edit'; name: FieldName; value: string }
  | { type: 'commit'; name: FieldName }
  | { type: 'step'; name: 'c'; delta: 1 | -1 }
  | { type: 'errors'; errors: DraftErrors }
  | { type: 'editEntry'; name: EntryField; value: string }
  | { type: 'addEntry' }
  | { type: 'removeEntry'; id: string };

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'edit':
      return { ...draft, fields: { ...draft.fields, [action.name]: action.value } };
    case 'commit': {
      // Errors appear after commit (blur/Enter), not on every keypress.
      const names: FieldName[] = action.name === 'serviceMin' || action.name === 'serviceMax' ? ['serviceMin', 'serviceMax'] : [action.name];
      const errors = { ...draft.errors };
      for (const name of names) delete errors[name];
      const found = fieldErrors(draft.fields, names);
      const fields = { ...draft.fields };
      const lambda = fieldValue(fields, 'lambda');
      if (action.name === 'lambda' && lambda !== null) fields.lambda = formatDecimal(lambda);
      if (action.name === 'horizonMin') delete errors.schedule;
      return { ...draft, fields, errors: { ...errors, ...found } };
    }
    case 'step': {
      const current = fieldValue(draft.fields, 'c');
      if (current === null) return draft;
      const next = Math.min(6, Math.max(1, current + action.delta));
      const { c: _removed, ...errors } = draft.errors;
      return { ...draft, fields: { ...draft.fields, c: String(next) }, errors };
    }
    case 'errors':
      return { ...draft, errors: action.errors };
    case 'editEntry':
      return { ...draft, entry: { ...draft.entry, [action.name]: action.value } };
    case 'addEntry': {
      const { entry: _old, ...errors } = draft.errors;
      const horizon = horizonSec(draft.fields);
      const minute = parseNumber(draft.entry.minute);
      const second = parseNumber(draft.entry.second);
      const count = parseNumber(draft.entry.count);
      if (horizon === null) return { ...draft, errors: { ...errors, entry: 'Perbaiki durasi menerima pelanggan terlebih dahulu.' } };
      if (minute === null || second === null || second > 59) {
        return { ...draft, errors: { ...errors, entry: 'Waktu harus menit dan detik bilangan bulat; detik 0–59.' } };
      }
      const at = minute * 60 + second;
      if (at >= horizon) {
        return { ...draft, errors: { ...errors, entry: `Waktu harus sebelum ${clock(horizon)}, akhir durasi menerima pelanggan.` } };
      }
      if (count === null || count < 1 || count > 20) return { ...draft, errors: { ...errors, entry: 'Jumlah pelanggan harus bilangan bulat 1–20.' } };
      try {
        const { schedule } = appendManualEntry(draft.schedule, horizon, at, count);
        return { ...draft, schedule, errors };
      } catch (error) {
        return { ...draft, errors: { ...errors, entry: error instanceof ValidationError ? 'Jadwal maksimal 2.000 pelanggan.' : String(error) } };
      }
    }
    case 'removeEntry': {
      const { schedule: _old, ...errors } = draft.errors;
      return { ...draft, schedule: draft.schedule.filter(entry => entry.id !== action.id), errors };
    }
  }
}

/** Full validation for Jalankan: never runs part of a draft that has an invalid field or entry. */
export function buildConfig(draft: Draft): { config: ScenarioConfig } | { errors: DraftErrors } {
  const errors = fieldErrors(draft.fields, FIELD_ORDER);
  if (outOfRange(draft).length > 0) errors.schedule = 'Ada jadwal di luar durasi menerima pelanggan. Hapus entry tersebut atau perpanjang durasi.';
  if (Object.keys(errors).length > 0) return { errors };
  const value = (name: FieldName) => fieldValue(draft.fields, name)!;
  try {
    return {
      config: validateConfig({
        ...DEFAULT_CONFIG, c: value('c'), lambdaPerMinute: value('lambda'), serviceMinSec: value('serviceMin'),
        serviceMaxSec: value('serviceMax'), horizonSec: value('horizonMin') * 60, rootSeed: value('seed'), manualSchedule: draft.schedule,
      }),
    };
  } catch (error) {
    return { errors: { schedule: error instanceof Error ? error.message : 'Konfigurasi tidak valid.' } };
  }
}

/** Nominal automatic load ρ = λ·E[S]/(60c); excludes manual arrivals by definition. */
export function nominalLoad(draft: Draft): number | null {
  const [c, lambda, a, b] = (['c', 'lambda', 'serviceMin', 'serviceMax'] as const).map(name => fieldValue(draft.fields, name));
  return c === null || lambda === null || a === null || b === null || b < a ? null : lambda * ((a + b) / 2) / (60 * c);
}
