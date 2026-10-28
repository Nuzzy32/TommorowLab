import { validateConfig, ValidationError, VERSIONS } from '../domain/config';
import type { ScenarioConfig } from '../domain/config';

// Local saved configurations: ARCHITECTURE §10, PRD FR-21–23 / NFR-12–13.
export const KEY_PREFIX = 'tomorrowlab:scenario:';
export const WRITE_LOCK = 'tomorrowlab:scenario-write:v1';
export const MAX_SLOTS = 10;
const MAX_RECORD_BYTES = 100 * 1024;

export type SavedRecord = {
  schemaVersion: 1;
  recordId: string;
  revision: number;
  savedAt: string;
  config: ScenarioConfig;
  versions: Pick<typeof VERSIONS, 'modelVersion' | 'engineVersion' | 'rngVersion' | 'seedDerivationVersion'>;
};
export type Slot =
  | { recordId: string; raw: string; status: 'ok'; record: SavedRecord }
  | { recordId: string; raw: string; status: 'invalid' | 'unsupported'; message: string };
export type Listing = { readable: boolean; writable: boolean; reason: string | null; slots: Slot[] };
/** What the user saw when opening a dialog; a write only proceeds if storage still holds exactly this. */
export type Expected = { recordId: string; raw: string };
export type Outcome =
  | { ok: true; record?: SavedRecord }
  | { ok: false; code: 'UNAVAILABLE' | 'INVALID' | 'FULL' | 'CONFLICT' | 'WRITE_FAILED' | 'UNCERTAIN'; message: string };

type LockManagerLike = { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T> | T): Promise<T> };

export const MESSAGES = {
  writeFailed: 'Konfigurasi belum tersimpan; browser menolak penyimpanan.',
  uncertain: 'Status penyimpanan belum dapat dipastikan. Daftar dimuat ulang; periksa sebelum mencoba lagi.',
  conflict: 'Data tersimpan berubah di tab lain. Daftar dimuat ulang; pilih lagi.',
  full: 'Penyimpanan penuh: pilih konfigurasi untuk diganti atau hapus satu slot.',
} as const;

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parses one stored value. Never repairs or partially loads: a bad record is reported as is. */
export function parseSlot(recordId: string, raw: string): Slot {
  const bad = (status: 'invalid' | 'unsupported', message: string): Slot => ({ recordId, raw, status, message });
  if (utf8Bytes(raw) > MAX_RECORD_BYTES) return bad('invalid', 'Ukuran record melebihi 100 KB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return bad('invalid', 'Data rusak (bukan JSON yang sah).'); }
  if (!isRecord(value)) return bad('invalid', 'Data rusak (bukan objek record).');
  if (value.schemaVersion !== 1) return bad('unsupported', 'Versi penyimpanan tidak didukung aplikasi ini.');
  if (value.recordId !== recordId) return bad('invalid', 'ID record tidak cocok dengan key penyimpanan.');
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return bad('invalid', 'Revisi record tidak sah.');
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return bad('invalid', 'Waktu simpan tidak sah.');
  let config: ScenarioConfig;
  try {
    config = validateConfig(value.config);
  } catch (error) {
    if (error instanceof ValidationError) {
      const unsupported = error.issues.some(issue => issue.field === 'schemaVersion' || issue.field === 'modelVersion');
      return bad(unsupported ? 'unsupported' : 'invalid', unsupported ? 'Versi model tidak didukung aplikasi ini.' : `Konfigurasi tidak sah: ${error.issues[0].message}`);
    }
    return bad('invalid', 'Konfigurasi tidak sah.');
  }
  const versions = isRecord(value.versions) ? value.versions : {};
  if (versions.rngVersion !== VERSIONS.rngVersion || versions.seedDerivationVersion !== VERSIONS.seedDerivationVersion) {
    return bad('unsupported', 'Versi sumber acak berbeda; hasil tidak akan sama.');
  }
  return {
    recordId, raw, status: 'ok',
    record: {
      schemaVersion: 1, recordId, revision: value.revision as number, savedAt: value.savedAt as string, config,
      versions: { modelVersion: VERSIONS.modelVersion, engineVersion: VERSIONS.engineVersion, rngVersion: VERSIONS.rngVersion, seedDerivationVersion: VERSIONS.seedDerivationVersion },
    },
  };
}

/** Name rules from CMP-12: 1–60 characters after trim; always rendered as text. */
export function nameError(name: string) {
  const trimmed = name.trim();
  return trimmed.length === 0 ? 'Nama wajib diisi.' : trimmed.length > 60 ? 'Nama maksimal 60 karakter.' : null;
}

export function createScenarioStore({ storage, locks, randomId, now = () => new Date() }: {
  storage: Storage | null; locks: LockManagerLike | null; randomId: () => string; now?: () => Date;
}) {
  // Enumerates only this app's namespace; never clear() the origin.
  function keys(store: Storage) {
    const found: string[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key?.startsWith(KEY_PREFIX)) found.push(key);
    }
    return found;
  }

  function list(): Listing {
    if (!storage) return { readable: false, writable: false, reason: 'Penyimpanan browser tidak tersedia. Simulasi tetap berjalan tanpa simpan lokal.', slots: [] };
    let slots: Slot[];
    try {
      slots = keys(storage).map(key => parseSlot(key.slice(KEY_PREFIX.length), storage.getItem(key) ?? ''));
    } catch {
      return { readable: false, writable: false, reason: 'Browser menolak akses penyimpanan. Simulasi tetap berjalan tanpa simpan lokal.', slots: [] };
    }
    slots.sort((x, y) => (x.status === 'ok' ? x.record.savedAt : '').localeCompare(y.status === 'ok' ? y.record.savedAt : '') * -1);
    const writable = locks !== null;
    return { readable: true, writable, reason: writable ? null : 'Browser ini tidak mendukung Web Locks, jadi menyimpan dan menghapus dinonaktifkan.', slots };
  }

  async function locked(task: (store: Storage) => Outcome): Promise<Outcome> {
    if (!storage || !locks) return { ok: false, code: 'UNAVAILABLE', message: 'Penyimpanan lokal tidak tersedia; simulasi tetap berjalan di memori.' };
    const store = storage;
    try {
      return await locks.request(WRITE_LOCK, { mode: 'exclusive' }, () => task(store));
    } catch {
      return { ok: false, code: 'WRITE_FAILED', message: MESSAGES.writeFailed };
    }
  }

  /**
   * Saves `config` under `name` as a new slot, or over `target` when the user chose to replace or update it.
   * Inside the lock the target is re-read and must still equal what the user saw (compare-and-swap).
   */
  function save(config: ScenarioConfig, name: string, target: Expected | null): Promise<Outcome> {
    const invalidName = nameError(name);
    if (invalidName) return Promise.resolve({ ok: false, code: 'INVALID', message: invalidName });
    return locked(store => {
      const recordId = target?.recordId ?? randomId();
      const key = KEY_PREFIX + recordId;
      let revision = 1;
      if (target) {
        if (store.getItem(key) !== target.raw) return { ok: false, code: 'CONFLICT', message: MESSAGES.conflict };
        const previous = parseSlot(recordId, target.raw);
        if (previous.status === 'ok') revision = previous.record.revision + 1;
      } else {
        if (keys(store).length >= MAX_SLOTS) return { ok: false, code: 'FULL', message: MESSAGES.full };
        if (store.getItem(key) !== null) return { ok: false, code: 'CONFLICT', message: MESSAGES.conflict };
      }
      let record: SavedRecord;
      let raw: string;
      try {
        record = {
          schemaVersion: 1, recordId, revision, savedAt: now().toISOString(),
          config: validateConfig({ ...config, id: recordId, name: name.trim() }),
          versions: { modelVersion: VERSIONS.modelVersion, engineVersion: VERSIONS.engineVersion, rngVersion: VERSIONS.rngVersion, seedDerivationVersion: VERSIONS.seedDerivationVersion },
        };
        raw = JSON.stringify(record);
        if (utf8Bytes(raw) > MAX_RECORD_BYTES) return { ok: false, code: 'INVALID', message: 'Konfigurasi melebihi 100 KB dan tidak dapat disimpan.' };
      } catch (error) {
        return { ok: false, code: 'INVALID', message: error instanceof Error ? error.message : 'Konfigurasi tidak sah.' };
      }
      try {
        store.setItem(key, raw);
      } catch {
        return { ok: false, code: 'WRITE_FAILED', message: MESSAGES.writeFailed };
      }
      try {
        if (store.getItem(key) !== raw) return { ok: false, code: 'UNCERTAIN', message: MESSAGES.uncertain };
      } catch {
        return { ok: false, code: 'UNCERTAIN', message: MESSAGES.uncertain };
      }
      return { ok: true, record };
    });
  }

  function remove(target: Expected): Promise<Outcome> {
    return locked(store => {
      const key = KEY_PREFIX + target.recordId;
      if (store.getItem(key) !== target.raw) return { ok: false, code: 'CONFLICT', message: MESSAGES.conflict };
      try {
        store.removeItem(key);
      } catch {
        return { ok: false, code: 'WRITE_FAILED', message: 'Konfigurasi belum terhapus; browser menolak perubahan.' };
      }
      return store.getItem(key) === null ? { ok: true } : { ok: false, code: 'UNCERTAIN', message: MESSAGES.uncertain };
    });
  }

  return { list, save, remove };
}

export type ScenarioStore = ReturnType<typeof createScenarioStore>;

/** Browser wiring; any access error degrades to "no local storage" instead of breaking the app. */
export function browserScenarioStore() {
  let storage: Storage | null = null;
  try {
    storage = typeof localStorage === 'undefined' ? null : localStorage;
    storage?.getItem(KEY_PREFIX);
  } catch {
    storage = null;
  }
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks as unknown as LockManagerLike : null;
  return createScenarioStore({ storage, locks, randomId: () => crypto.randomUUID() });
}

const HELP_SEEN_KEY = 'tomorrowlab:pref:help-seen';
/** Per-browser preference; failures simply show the help again. */
export const helpSeen = () => { try { return localStorage.getItem(HELP_SEEN_KEY) === '1'; } catch { return false; } };
export const markHelpSeen = () => { try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* help shows again next visit */ } };
