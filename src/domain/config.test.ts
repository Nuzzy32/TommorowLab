import { describe, expect, test } from 'vitest';
import {
  appendManualEntry, DEFAULT_CONFIG, MAX_CUSTOMERS, promoteManualLog,
  validateConfig, validateManualSchedule, ValidationError, VERSIONS,
} from './config';
import type { ManualEntry } from './config';

const entry = (overrides: Partial<ManualEntry> = {}): ManualEntry => ({
  id: 'entry:0', atSimSec: 0, count: 1, sequence: 0, customerOrdinals: [0], ...overrides,
});

describe('configuration boundary', () => {
  test('defaults and versions match the canonical contract', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toMatchObject({ id: 'lunch', name: 'Jam makan siang', rootSeed: 2026 });
    expect(VERSIONS).toEqual({
      schemaVersion: 1, modelVersion: 'canteen-fifo-v1', engineVersion: 'des-ts-v1',
      rngVersion: 'pcg32-xsh-rr-v1', seedDerivationVersion: 'seed-pcg32-v1', protocolVersion: 1,
    });
  });

  test.each([
    { c: 1, lambdaPerMinute: 0, serviceMinSec: 1, serviceMaxSec: 1, horizonSec: 60, rootSeed: 0 },
    { c: 6, lambdaPerMinute: 20, serviceMinSec: 300, serviceMaxSec: 300, horizonSec: 1800, rootSeed: 0xffff_ffff },
    { lambdaPerMinute: 0.1, horizonSec: 60.5 },
  ])('accepts exact model boundaries and zero seed: %j', (overrides) => {
    expect(validateConfig({ ...DEFAULT_CONFIG, ...overrides })).toMatchObject(overrides);
  });

  test.each([
    ['c', 0], ['c', 7], ['c', 1.5], ['lambdaPerMinute', -1], ['lambdaPerMinute', 21],
    ['serviceMinSec', 0], ['serviceMinSec', 1.5], ['serviceMaxSec', 19], ['serviceMaxSec', 301],
    ['horizonSec', 59], ['horizonSec', 1801], ['rootSeed', -1], ['rootSeed', 2 ** 32],
    ['rootSeed', 0.5], ['c', NaN], ['lambdaPerMinute', Infinity], ['serviceMaxSec', -Infinity],
    ['c', '2'], ['c', undefined], ['schemaVersion', 2], ['modelVersion', 'unknown'], ['name', '   '],
    ['name', 'a'.repeat(61)], ['id', ''], ['manualSchedule', null],
  ])('rejects invalid %s = %s with field diagnostics', (field, value) => {
    try {
      validateConfig({ ...DEFAULT_CONFIG, [field]: value });
      expect.unreachable('Invalid input was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues[0]).toMatchObject({ field });
    }
  });

  test.each([null, undefined, [], 1, 'config', new Date(), {}])('rejects invalid objects: %s', (input) => {
    expect(() => validateConfig(input)).toThrow(ValidationError);
  });

  test('trims names, preserves literal HTML, and deep copies without mutation', () => {
    const source = { ...DEFAULT_CONFIG, name: '  <b>Kantin</b>  ', manualSchedule: [entry()] };
    const before = structuredClone(source);
    const result = validateConfig(source);
    expect(result.name).toBe('<b>Kantin</b>');
    result.manualSchedule[0].customerOrdinals[0] = 5;
    result.manualSchedule.push(entry({ id: 'new' }));
    expect(source).toEqual(before);
  });

  test('rejects oversized bytes before runtime allocation, including UTF-8 and unknown properties', () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, extra: 'x'.repeat(102_401) })).toThrow(/100 KB/);
    expect(() => validateConfig({ ...DEFAULT_CONFIG, extra: '漢'.repeat(40_000) })).toThrow(/100 KB/);
    const circular: Record<string, unknown> = { ...DEFAULT_CONFIG };
    circular.self = circular;
    expect(() => validateConfig(circular)).toThrow(ValidationError);
  });
});

describe('manual identity and schedule', () => {
  test.each([
    null, {}, [null], [{}], Array(1), [entry({ customerOrdinals: Array(1) })],
    [entry({ atSimSec: 900 })], [entry({ atSimSec: -1 })],
    [entry({ atSimSec: NaN })], [entry({ atSimSec: Infinity })],
    [entry({ count: 0 })], [entry({ count: 21 })], [entry({ count: 1.5 })],
    [entry({ sequence: -1 })], [entry({ sequence: 0.5 })], [entry({ sequence: 2 ** 53 })],
    [entry({ customerOrdinals: [] })], [entry({ customerOrdinals: [-1] })],
    [entry({ customerOrdinals: [2000] })], [entry({ customerOrdinals: [0.5] })],
    [entry({ count: 2, customerOrdinals: [0, 0] })],
    [entry(), entry({ sequence: 1, customerOrdinals: [1] })],
    [entry(), entry({ id: 'other', customerOrdinals: [1] })],
    [entry(), entry({ id: 'other', sequence: 1 })],
  ])('rejects malformed or duplicate schedule %j', (input) => {
    expect(() => validateManualSchedule(input, 900)).toThrow(ValidationError);
  });

  test('preserves order and allows 2000 manual customers, rejecting another customer', () => {
    const schedule = Array.from({ length: 100 }, (_, index) => entry({
      id: String(index), sequence: index, count: 20,
      customerOrdinals: Array.from({ length: 20 }, (_, position) => index * 20 + position),
    }));
    expect(validateManualSchedule(schedule, 900).flatMap((item) => item.customerOrdinals)).toHaveLength(MAX_CUSTOMERS);
    expect(() => appendManualEntry(schedule, 900, 0, 1)).toThrow(ValidationError);
    expect(() => validateManualSchedule([...schedule, entry({ id: 'over', sequence: 100 })], 900)).toThrow(ValidationError);
    const unordered = [entry({ count: 2, customerOrdinals: [4, 2] })];
    expect(validateManualSchedule(unordered, 900)).toEqual(unordered);
  });

  test('append allocates lowest unused ordinals and max sequence + 1 without mutation', () => {
    const schedule = [entry({ id: 'manual:8', count: 2, customerOrdinals: [2, 0], sequence: 7 })];
    const before = structuredClone(schedule);
    const result = appendManualEntry(schedule, 900, 123.5, 2);
    expect(result.entry).toEqual({ id: 'manual:8:', atSimSec: 123.5, count: 2, sequence: 8, customerOrdinals: [1, 3] });
    expect(appendManualEntry(schedule, 900, 123.5, 2)).toEqual(result);
    result.schedule[0].customerOrdinals[0] = 100;
    expect(schedule).toEqual(before);
    expect(appendManualEntry([], 900, 0, 1).entry.sequence).toBe(0);
  });

  test('append rejects exhausted sequence, invalid time and count', () => {
    expect(() => appendManualEntry([entry({ sequence: Number.MAX_SAFE_INTEGER })], 900, 0, 1)).toThrow(ValidationError);
    expect(() => appendManualEntry([], 900, 900, 1)).toThrow(ValidationError);
    expect(() => appendManualEntry([], 900, 0, 0)).toThrow(ValidationError);
  });

  test('promotion preserves identities once, copies sources, and validates combined uniqueness', () => {
    const config = { ...DEFAULT_CONFIG, manualSchedule: [entry()] };
    const log = [entry({ id: 'live', sequence: 2, customerOrdinals: [5], atSimSec: 4 })];
    const before = structuredClone({ config, log });
    const promoted = promoteManualLog(config, log);
    expect(promoted.manualSchedule).toEqual([...config.manualSchedule, ...log]);
    promoted.manualSchedule[1].customerOrdinals[0] = 100;
    expect({ config, log }).toEqual(before);
    expect(() => promoteManualLog(config, [entry()])).toThrow(ValidationError);
    expect(() => promoteManualLog(config, [entry({ id: 'live', sequence: 2 })])).toThrow(ValidationError);
  });
});
