import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import { createScenarioStore, KEY_PREFIX, MAX_SLOTS, MESSAGES, nameError, parseSlot, WRITE_LOCK } from './scenarios';

// Minimal Storage stand-in; `failSet` simulates quota/blocked writes, `lie` a write that does not stick.
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failSet = false;
  lie = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failSet) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(key, this.lie ? `${value} ` : value);
  }
  removeItem(key: string) { this.data.delete(key); }
  clear() { throw new Error('the app must never clear the origin'); }
}

function setup() {
  const storage = new MemoryStorage();
  const names: string[] = [];
  const locks = { async request<T>(name: string, _options: { mode: 'exclusive' }, callback: () => Promise<T> | T) { names.push(name); return callback(); } };
  let id = 0;
  const store = createScenarioStore({ storage, locks, randomId: () => `id-${++id}`, now: () => new Date('2026-10-28T09:00:00Z') });
  return { storage, store, names };
}

describe('saved scenario records', () => {
  it('FR-21 saves one versioned record per key under the write lock and reads it back exactly', async () => {
    const { storage, store, names } = setup();
    storage.setItem('other-app', 'keep');
    const config = { ...DEFAULT_CONFIG, manualSchedule: [{ id: 'e', atSimSec: 30, count: 2, sequence: 0, customerOrdinals: [0, 1] }] };
    const saved = await store.save(config, '  Siang ramai  ', null);
    expect(saved).toMatchObject({ ok: true, record: { recordId: 'id-1', revision: 1, config: { name: 'Siang ramai', id: 'id-1', rootSeed: 2026 } } });
    expect(names).toEqual([WRITE_LOCK]);
    const [slot] = store.list().slots;
    expect(slot).toMatchObject({ status: 'ok', record: { config: { manualSchedule: config.manualSchedule, c: 2, lambdaPerMinute: 4 } } });
    expect(storage.getItem('other-app')).toBe('keep');
    expect(JSON.parse(storage.getItem(`${KEY_PREFIX}id-1`)!).schemaVersion).toBe(1);
  });

  it('keeps names as text and enforces 1–60 characters after trim', async () => {
    const { store } = setup();
    expect(nameError('   ')).toBe('Nama wajib diisi.');
    expect(nameError('x'.repeat(61))).toBe('Nama maksimal 60 karakter.');
    expect(await store.save(DEFAULT_CONFIG, '', null)).toMatchObject({ ok: false, code: 'INVALID' });
    const html = '<img src=x onerror=alert(1)>';
    await store.save(DEFAULT_CONFIG, html, null);
    expect(store.list().slots[0]).toMatchObject({ status: 'ok', record: { config: { name: html } } });
  });

  it('allows 10 slots, refuses an 11th new slot and replaces only the chosen one', async () => {
    const { store } = setup();
    for (let index = 0; index < MAX_SLOTS; index++) expect(await store.save(DEFAULT_CONFIG, `Slot ${index}`, null)).toMatchObject({ ok: true });
    expect(await store.save(DEFAULT_CONFIG, 'Satu lagi', null)).toEqual({ ok: false, code: 'FULL', message: MESSAGES.full });
    const target = store.list().slots.find(slot => slot.status === 'ok' && slot.record.config.name === 'Slot 3')!;
    const replaced = await store.save({ ...DEFAULT_CONFIG, c: 5 }, 'Pengganti', { recordId: target.recordId, raw: target.raw });
    expect(replaced).toMatchObject({ ok: true, record: { recordId: target.recordId, revision: 2, config: { c: 5 } } });
    const names = store.list().slots.map(slot => slot.status === 'ok' && slot.record.config.name);
    expect(names).toHaveLength(10);
    expect(names).toContain('Pengganti');
    expect(names).not.toContain('Slot 3');
  });

  it('compare-and-swap: a change from another tab is a conflict, never a silent overwrite or delete', async () => {
    const { storage, store } = setup();
    await store.save(DEFAULT_CONFIG, 'A', null);
    const seen = store.list().slots[0];
    await store.save({ ...DEFAULT_CONFIG, c: 3 }, 'A dari tab lain', { recordId: seen.recordId, raw: seen.raw });
    const after = storage.getItem(KEY_PREFIX + seen.recordId);
    expect(await store.save(DEFAULT_CONFIG, 'A', { recordId: seen.recordId, raw: seen.raw })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await store.remove({ recordId: seen.recordId, raw: seen.raw })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(storage.getItem(KEY_PREFIX + seen.recordId)).toBe(after);
  });

  it('NFR-13 a refused write keeps the last valid record; an unverifiable write is reported as uncertain', async () => {
    const { storage, store } = setup();
    await store.save(DEFAULT_CONFIG, 'Valid', null);
    const seen = store.list().slots[0];
    storage.failSet = true;
    expect(await store.save({ ...DEFAULT_CONFIG, c: 4 }, 'Valid', { recordId: seen.recordId, raw: seen.raw }))
      .toEqual({ ok: false, code: 'WRITE_FAILED', message: MESSAGES.writeFailed });
    expect(storage.getItem(KEY_PREFIX + seen.recordId)).toBe(seen.raw);
    storage.failSet = false;
    storage.lie = true;
    expect(await store.save(DEFAULT_CONFIG, 'Baru', null)).toMatchObject({ ok: false, code: 'UNCERTAIN' });
  });

  it('FR-23 corrupt and unsupported records are listed, never loaded and never deleted automatically', () => {
    const { storage, store } = setup();
    storage.setItem(`${KEY_PREFIX}broken`, '{not json');
    storage.setItem(`${KEY_PREFIX}future`, JSON.stringify({ schemaVersion: 2, recordId: 'future' }));
    storage.setItem(`${KEY_PREFIX}model`, JSON.stringify({
      schemaVersion: 1, recordId: 'model', revision: 1, savedAt: '2026-10-28T09:00:00Z',
      config: { ...DEFAULT_CONFIG, modelVersion: 'canteen-lifo-v9' }, versions: {},
    }));
    storage.setItem(`${KEY_PREFIX}range`, JSON.stringify({
      schemaVersion: 1, recordId: 'range', revision: 1, savedAt: '2026-10-28T09:00:00Z',
      config: { ...DEFAULT_CONFIG, c: 9 }, versions: { rngVersion: 'pcg32-xsh-rr-v1', seedDerivationVersion: 'seed-pcg32-v1' },
    }));
    const byId = Object.fromEntries(store.list().slots.map(slot => [slot.recordId, slot.status]));
    expect(byId).toEqual({ broken: 'invalid', future: 'unsupported', model: 'unsupported', range: 'invalid' });
    expect(storage.length).toBe(4);
    expect(parseSlot('x', 'a'.repeat(100 * 1024 + 1))).toMatchObject({ status: 'invalid', message: expect.stringContaining('100 KB') });
  });

  it('FR-22 deletes only the chosen slot', async () => {
    const { storage, store } = setup();
    await store.save(DEFAULT_CONFIG, 'Satu', null);
    await store.save(DEFAULT_CONFIG, 'Dua', null);
    storage.setItem('tomorrowlab:pref:help-seen', '1');
    const target = store.list().slots.find(slot => slot.status === 'ok' && slot.record.config.name === 'Satu')!;
    expect(await store.remove({ recordId: target.recordId, raw: target.raw })).toEqual({ ok: true });
    expect(store.list().slots.map(slot => slot.status === 'ok' && slot.record.config.name)).toEqual(['Dua']);
    expect(storage.getItem('tomorrowlab:pref:help-seen')).toBe('1');
  });

  it('without storage or Web Locks, writes are disabled with a reason and the app keeps running', async () => {
    const none = createScenarioStore({ storage: null, locks: null, randomId: () => 'x' });
    expect(none.list()).toMatchObject({ readable: false, writable: false, reason: expect.stringContaining('tanpa simpan lokal') });
    expect(await none.save(DEFAULT_CONFIG, 'A', null)).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    const readOnly = createScenarioStore({ storage: new MemoryStorage(), locks: null, randomId: () => 'x' });
    expect(readOnly.list()).toMatchObject({ readable: true, writable: false, reason: expect.stringContaining('Web Locks') });
  });
});
