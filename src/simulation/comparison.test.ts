import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import type { ScenarioConfig } from '../domain/config';
import { demandMismatch, PAIRS, paramChanges, replicationSummary, sameDemand, summarize, T_CRIT_DF19 } from './comparison';
import type { PairResult, ReplicationSummary } from './comparison';
import { createSimulation } from './engine';

const rep = (meanWaitSec: number | null, patch: Partial<ReplicationSummary> = {}): ReplicationSummary => ({
  n: meanWaitSec === null ? 0 : 10, meanWaitSec, p95WaitSec: meanWaitSec === null ? null : meanWaitSec * 2,
  throughputPerMinute: 1, utilization: 0.5, maxQueue: 2, ...patch,
});
const pairs = (deltas: number[], baseline = 10): PairResult[] =>
  deltas.map((delta, r) => ({ r, a: rep(baseline), b: rep(baseline + delta) }));

describe('paired summary (SIMULATION_SPEC §6)', () => {
  it('ST-09 ten −1 and ten +1 give delta 0, variance 20/19 and the locked half width', () => {
    const summary = summarize(pairs([...Array(10).fill(-1), ...Array(10).fill(1)]), false);
    expect(summary.meanDeltaSec).toBe(0);
    expect(summary.standardErrorSec! ** 2 * 20).toBeCloseTo(20 / 19, 14);
    const half = 2.093024 / Math.sqrt(19);
    expect(half).toBeCloseTo(0.48017263696869866, 15);
    expect(summary.ci95![0]).toBeCloseTo(-half, 14);
    expect(summary.ci95![1]).toBeCloseTo(half, 14);
    expect(summary.verdict).toBe('INCONCLUSIVE');
    expect(T_CRIT_DF19).toBe(2.093024);
  });

  it('labels a fully negative or positive interval and computes percent from replication means', () => {
    const lower = summarize(pairs(Array.from({ length: PAIRS }, (_, r) => -4 - (r % 3))), false);
    expect(lower.verdict).toBe('B_LOWER');
    expect(lower.ci95![1]).toBeLessThan(0);
    expect(lower.percentChange).toBeCloseTo((100 * lower.meanDeltaSec!) / 10, 12);
    expect(summarize(pairs(Array.from({ length: PAIRS }, (_, r) => 3 + (r % 2))), false).verdict).toBe('B_HIGHER');
  });

  it('a CI touching zero is inconclusive', () => {
    expect(summarize(pairs(Array(PAIRS).fill(0)), false)).toMatchObject({ meanDeltaSec: 0, ci95: [0, 0], verdict: 'INCONCLUSIVE' });
    expect(summarize(pairs(Array(PAIRS).fill(0)), true)).toMatchObject({ ci95: [0, 0], verdict: 'IDENTICAL' });
  });

  it('SX-08 one empty pair makes wait aggregates, delta, percent and CI N/A without dropping the pair', () => {
    const data = pairs(Array(PAIRS).fill(-2));
    data[7] = { r: 7, a: rep(null), b: rep(null) };
    const summary = summarize(data, true);
    expect(summary).toMatchObject({ pairs: 20, emptyPairs: 1, meanDeltaSec: null, ci95: null, percentChange: null, verdict: 'INSUFFICIENT_DATA' });
    expect(summary.a.meanWaitSec).toBeNull();
    expect(summary.a.meanP95WaitSec).toBeNull();
    expect(summary.a.throughputPerMinute).toBe(1);
  });

  it('baseline mean 0 keeps the absolute delta and CI but percent is N/A', () => {
    const summary = summarize(pairs(Array.from({ length: PAIRS }, (_, r) => 1 + (r % 2)), 0), false);
    expect(summary.percentChange).toBeNull();
    expect(summary.meanDeltaSec).toBeCloseTo(1.5, 12);
    expect(summary.verdict).toBe('B_HIGHER');
  });

  it('refuses to summarise anything but exactly 20 pairs', () => {
    expect(() => summarize(pairs(Array(19).fill(1)), false)).toThrow(RangeError);
  });
});

describe('fairness and pairing', () => {
  const b = (patch: Partial<ScenarioConfig>): ScenarioConfig => ({ ...DEFAULT_CONFIG, ...patch });

  it('only c and the service range may differ; schedule identity is compared exactly', () => {
    expect(demandMismatch(DEFAULT_CONFIG, b({ c: 3, serviceMinSec: 10, serviceMaxSec: 20, name: 'B', id: 'b' }))).toEqual([]);
    expect(paramChanges(DEFAULT_CONFIG, b({ c: 3 }))).toEqual([{ field: 'c', a: 2, b: 3 }]);
    expect(demandMismatch(DEFAULT_CONFIG, b({ lambdaPerMinute: 5, rootSeed: 1 }))).toEqual(['lambdaPerMinute', 'rootSeed']);
    const entry = { id: 'e', atSimSec: 30, count: 2, sequence: 0, customerOrdinals: [0, 1] };
    expect(demandMismatch(b({ manualSchedule: [entry] }), b({ manualSchedule: [{ ...entry, customerOrdinals: [1, 2] }] }))).toEqual(['manualSchedule']);
  });

  it('ST-06 A=B with the same seed gives identical demand and ledgers in every pair', () => {
    for (const r of [0, 7, 19]) {
      const runA = createSimulation(DEFAULT_CONFIG, r); runA.start();
      const runB = createSimulation({ ...DEFAULT_CONFIG, id: 'b', name: 'B' }, r); runB.start();
      const a = runA.finish(); const bResult = runB.finish();
      expect(sameDemand(a.customers, bResult.customers)).toBe(true);
      expect(replicationSummary(a.result!)).toEqual(replicationSummary(bResult.result!));
    }
  });

  it('changing c or the service range keeps every customer id, arrival and service uniform (CRN)', () => {
    const runA = createSimulation(DEFAULT_CONFIG, 3); runA.start();
    const runB = createSimulation({ ...DEFAULT_CONFIG, c: 4, serviceMinSec: 5, serviceMaxSec: 60 }, 3); runB.start();
    const a = runA.finish(); const bResult = runB.finish();
    expect(a.customers.length).toBeGreaterThan(0);
    expect(sameDemand(a.customers, bResult.customers)).toBe(true);
    expect(a.customers.map(customer => customer.serviceSec)).not.toEqual(bResult.customers.map(customer => customer.serviceSec));
    const other = createSimulation(DEFAULT_CONFIG, 4); other.start();
    expect(sameDemand(a.customers, other.finish().customers)).toBe(false);
  });
});
