import type { ScenarioConfig } from '../domain/config';
import type { RunResult, Snapshot } from './engine';

// Paired A/B summary contract: SIMULATION_SPEC §6 and PRD FR-16–20.
export const PAIRS = 20;
/** Student-t critical value, two-sided 95%, df = 19 (locked by the PRD). */
export const T_CRIT_DF19 = 2.093024;
export const SUMMARY_METHOD = 'paired-t-df19-v1';

export type DemandField = 'lambdaPerMinute' | 'horizonSec' | 'rootSeed' | 'manualSchedule' | 'modelVersion' | 'schemaVersion';
export type ParamField = 'c' | 'serviceMinSec' | 'serviceMaxSec';
export const PARAM_FIELDS: ParamField[] = ['c', 'serviceMinSec', 'serviceMaxSec'];

const scheduleKey = (config: ScenarioConfig) => JSON.stringify(
  [...config.manualSchedule].sort((x, y) => x.sequence - y.sequence)
    .map(({ id, atSimSec, count, sequence, customerOrdinals }) => [id, atSimSec, count, sequence, customerOrdinals]),
);

/** Demand fields that differ between A and B. Only c and the service range may differ (FR-17). */
export function demandMismatch(a: ScenarioConfig, b: ScenarioConfig): DemandField[] {
  const fields: DemandField[] = [];
  for (const field of ['lambdaPerMinute', 'horizonSec', 'rootSeed', 'modelVersion', 'schemaVersion'] as const) {
    if (a[field] !== b[field]) fields.push(field);
  }
  if (scheduleKey(a) !== scheduleKey(b)) fields.push('manualSchedule');
  return fields;
}

export const paramChanges = (a: ScenarioConfig, b: ScenarioConfig) =>
  PARAM_FIELDS.filter(field => a[field] !== b[field]).map(field => ({ field, a: a[field], b: b[field] }));

/** Every customer keeps the same ID, arrival time and service uniform on both sides of a pair. */
export function sameDemand(a: Snapshot['customers'], b: Snapshot['customers']) {
  return a.length === b.length && a.every((customer, index) =>
    customer.id === b[index].id && customer.arrivalAt === b[index].arrivalAt && customer.serviceDemandU === b[index].serviceDemandU);
}

export type ReplicationSummary = {
  n: number; meanWaitSec: number | null; p95WaitSec: number | null;
  throughputPerMinute: number; utilization: number; maxQueue: number;
};
export type PairResult = { r: number; a: ReplicationSummary; b: ReplicationSummary };

export function replicationSummary(result: RunResult): ReplicationSummary {
  return {
    n: result.counts.arrived,
    meanWaitSec: result.cohortMetrics.meanWaitSec.value,
    p95WaitSec: result.cohortMetrics.p95WaitSec.value,
    throughputPerMinute: result.horizonMetrics.throughputPerMinute,
    utilization: result.horizonMetrics.utilization,
    maxQueue: result.horizonMetrics.maxQueue,
  };
}

export type Verdict = 'IDENTICAL' | 'B_LOWER' | 'B_HIGHER' | 'INCONCLUSIVE' | 'INSUFFICIENT_DATA';
type Side = { meanWaitSec: number | null; meanP95WaitSec: number | null; throughputPerMinute: number; utilization: number; maxQueue: number };
export type ComparisonSummary = {
  method: typeof SUMMARY_METHOD;
  pairs: number;
  emptyPairs: number;
  a: Side;
  b: Side;
  meanDeltaSec: number | null;
  standardErrorSec: number | null;
  ci95: [number, number] | null;
  percentChange: number | null;
  verdict: Verdict;
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** Mean of a per-replication value; N/A as soon as one replication has none (never treated as 0). */
const meanOrNull = (values: (number | null)[]) => (values.some(value => value === null) ? null : mean(values as number[]));

function side(results: ReplicationSummary[]): Side {
  return {
    meanWaitSec: meanOrNull(results.map(result => result.meanWaitSec)),
    meanP95WaitSec: meanOrNull(results.map(result => result.p95WaitSec)),
    throughputPerMinute: mean(results.map(result => result.throughputPerMinute)),
    utilization: mean(results.map(result => result.utilization)),
    maxQueue: mean(results.map(result => result.maxQueue)),
  };
}

/**
 * Summary of exactly 20 valid pairs. Means are per-replication (no pooling of customers);
 * the CI is a paired t-interval on d_r = wait_B,r − wait_A,r with a two-pass variance.
 */
export function summarize(pairs: PairResult[], identicalConfigs: boolean): ComparisonSummary {
  if (pairs.length !== PAIRS) throw new RangeError(`Ringkasan membutuhkan tepat ${PAIRS} pasangan.`);
  const a = side(pairs.map(pair => pair.a));
  const b = side(pairs.map(pair => pair.b));
  const emptyPairs = pairs.filter(pair => pair.a.meanWaitSec === null || pair.b.meanWaitSec === null).length;
  const base = { method: SUMMARY_METHOD, pairs: pairs.length, emptyPairs, a, b } as const;
  // Empty pairs take precedence over the identical label (SIMULATION_SPEC §6).
  if (emptyPairs > 0) {
    return { ...base, meanDeltaSec: null, standardErrorSec: null, ci95: null, percentChange: null, verdict: 'INSUFFICIENT_DATA' };
  }
  const deltas = pairs.map(pair => pair.b.meanWaitSec! - pair.a.meanWaitSec!);
  const meanDelta = mean(deltas);
  const variance = deltas.reduce((sum, delta) => sum + (delta - meanDelta) ** 2, 0) / (deltas.length - 1);
  const standardError = Math.sqrt(variance) / Math.sqrt(deltas.length);
  const half = T_CRIT_DF19 * standardError;
  const ci95: [number, number] = [meanDelta - half, meanDelta + half];
  const verdict: Verdict = identicalConfigs ? 'IDENTICAL' : ci95[1] < 0 ? 'B_LOWER' : ci95[0] > 0 ? 'B_HIGHER' : 'INCONCLUSIVE';
  return {
    ...base, meanDeltaSec: meanDelta, standardErrorSec: standardError, ci95,
    percentChange: a.meanWaitSec === 0 ? null : (100 * (b.meanWaitSec! - a.meanWaitSec!)) / a.meanWaitSec!,
    verdict,
  };
}

/** Canonical signature of everything that changes the numbers (ARCHITECTURE §5.3); names and ids excluded. */
export const configSignature = (config: ScenarioConfig) => JSON.stringify([
  config.c, config.lambdaPerMinute, config.serviceMinSec, config.serviceMaxSec, config.horizonSec, config.rootSeed,
  config.modelVersion, config.schemaVersion, scheduleKey(config),
]);
