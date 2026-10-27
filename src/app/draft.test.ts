import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import { buildConfig, draftReducer, initialDraft, nominalLoad, parseNumber } from './draft';
import type { Draft, DraftAction, FieldName } from './draft';
import { formatClock, formatPercent, formatSeconds } from './format';

const apply = (actions: DraftAction[], draft: Draft = initialDraft()) => actions.reduce(draftReducer, draft);
const edit = (name: FieldName, value: string): DraftAction[] => [{ type: 'edit', name, value }, { type: 'commit', name }];

describe('draft parsing and validation', () => {
  it('accepts one comma or dot only for decimals and rejects thousands separators', () => {
    expect(parseNumber('4,5', true)).toBe(4.5);
    expect(parseNumber(' 4.5 ', true)).toBe(4.5);
    expect(parseNumber('4,5')).toBeNull();
    expect(parseNumber('1.000')).toBeNull();
    expect(parseNumber('1,000.5', true)).toBeNull();
    expect(parseNumber('', true)).toBeNull();
    expect(parseNumber('-1')).toBeNull();
  });

  it('builds exactly the default config from the preset', () => {
    expect(buildConfig(initialDraft())).toEqual({ config: DEFAULT_CONFIG });
  });

  it('reports errors after commit without clamping, including max < min', () => {
    const draft = apply([...edit('c', '7'), ...edit('serviceMax', '10'), ...edit('lambda', '20,5')]);
    expect(draft.fields).toMatchObject({ c: '7', serviceMax: '10', lambda: '20,5' });
    expect(draft.errors).toMatchObject({
      c: 'Jumlah loket harus bilangan bulat 1–6.', serviceMax: 'Waktu maksimum harus ≥ minimum.',
      lambda: 'Kedatangan otomatis harus angka 0–20 pelanggan/menit.',
    });
    const built = buildConfig(draft);
    expect('errors' in built && Object.keys(built.errors)).toEqual(['c', 'lambda', 'serviceMax']);
    const fixed = apply([...edit('serviceMin', '5')], draft);
    expect(fixed.errors.serviceMax).toBeUndefined();
  });

  it('normalizes a committed decimal to a comma and steps loket only within 1–6', () => {
    expect(apply(edit('lambda', '1.5')).fields.lambda).toBe('1,5');
    const six = apply(Array<DraftAction>(9).fill({ type: 'step', name: 'c', delta: 1 }));
    expect(six.fields.c).toBe('6');
    expect(apply([{ type: 'step', name: 'c', delta: -1 }, { type: 'step', name: 'c', delta: -1 }]).fields.c).toBe('1');
  });

  it('adds schedule entries with stable identity and flags, never deletes, entries outside a shorter horizon', () => {
    let draft = apply([
      { type: 'editEntry', name: 'minute', value: '10' }, { type: 'editEntry', name: 'count', value: '3' }, { type: 'addEntry' },
      { type: 'editEntry', name: 'minute', value: '1' }, { type: 'addEntry' },
    ]);
    expect(draft.schedule.map(e => [e.atSimSec, e.count, e.sequence, e.customerOrdinals])).toEqual([[600, 3, 0, [0, 1, 2]], [60, 3, 1, [3, 4, 5]]]);
    draft = apply([...edit('horizonMin', '5')], draft);
    expect(draft.schedule).toHaveLength(2);
    expect(buildConfig(draft)).toMatchObject({ errors: { schedule: expect.stringContaining('di luar durasi') } });
    draft = apply([{ type: 'removeEntry', id: draft.schedule[0].id }], draft);
    const built = buildConfig(draft);
    expect('config' in built && built.config.manualSchedule).toEqual([draft.schedule[0]]);
    expect(draft.schedule[0].customerOrdinals).toEqual([3, 4, 5]);
  });

  it('rejects invalid schedule entries with a specific message', () => {
    expect(apply([{ type: 'editEntry', name: 'minute', value: '15' }, { type: 'addEntry' }]).errors.entry).toBe('Waktu harus sebelum 15:00, akhir durasi menerima pelanggan.');
    expect(apply([{ type: 'editEntry', name: 'second', value: '60' }, { type: 'addEntry' }]).errors.entry).toMatch('detik 0–59');
    expect(apply([{ type: 'editEntry', name: 'count', value: '21' }, { type: 'addEntry' }]).errors.entry).toBe('Jumlah pelanggan harus bilangan bulat 1–20.');
  });

  it('nominal load matches ρ = λ·E[S]/(60c)', () => {
    expect(nominalLoad(initialDraft())).toBe(1);
    expect(nominalLoad(apply(edit('c', '3')))).toBeCloseTo(2 / 3, 12);
    expect(nominalLoad(apply(edit('c', 'x')))).toBeNull();
  });
});

describe('display formatting', () => {
  it('uses Indonesian separators, fixed decimals and a non-capping clock', () => {
    expect(formatSeconds(10)).toBe('10,00 detik');
    expect(formatSeconds(0.001)).toBe('<0,01 detik');
    expect(formatSeconds(-0.001)).toBe('>−0,01 detik');
    expect(formatSeconds(-1.5)).toBe('−1,50 detik');
    expect(formatPercent(0.5)).toBe('50,0%');
    expect(formatClock(130.9)).toBe('02:10');
    expect(formatClock(3725)).toBe('01:02:05');
  });
});
