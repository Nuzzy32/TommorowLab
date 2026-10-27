import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, promoteManualLog } from '../domain/config';
import type { ManualEntry, ScenarioConfig } from '../domain/config';
import { createFixtureSimulation, createSimulation } from './engine';

type Engine = ReturnType<typeof createSimulation>;
type Snapshot = ReturnType<Engine['snapshot']>;
const config = (patch: Partial<ScenarioConfig> = {}): ScenarioConfig => ({
  ...DEFAULT_CONFIG, c: 1, lambdaPerMinute: 0, serviceMinSec: 10, serviceMaxSec: 10,
  horizonSec: 60, manualSchedule: [], ...patch,
});
const manual = (sequence: number, atSimSec: number, customerOrdinals: number[]): ManualEntry => ({
  id: `entry:${sequence}`, sequence, atSimSec, count: customerOrdinals.length, customerOrdinals,
});
const fixture = (arrivals: number[], serviceSec = 10, patch: Partial<ScenarioConfig> = {}) =>
  createFixtureSimulation(config(patch), arrivals.map(atSimSec => ({ atSimSec, serviceSec })));
const close = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-8, 1e-10 * Math.max(Math.abs(actual), Math.abs(expected))));
const starts = (s: Snapshot) => s.customers.map(customer => customer.serviceStartAt);
const departures = (s: Snapshot) => s.customers.map(customer => customer.departureAt);
const demand = (s: Snapshot) => s.customers.map(({ id, arrivalAt, serviceDemandU }) => ({ id, arrivalAt, serviceDemandU }));
function finish(engine: Engine) { engine.start(); return engine.finish(); }

function invariant(s: Snapshot) {
  const { counts, customers, servers, waitingCustomerIds } = s;
  expect(Number.isFinite(s.simTimeSec)).toBe(true);
  expect(counts.arrived).toBe(counts.waiting + counts.inService + counts.completed);
  expect(counts.arrived).toBe(customers.length);
  expect(counts.automatic + counts.manual).toBe(counts.arrived);
  expect(counts.inService).toBeLessThanOrEqual(s.configSnapshot.c);
  expect(new Set(customers.map(customer => customer.id)).size).toBe(customers.length);
  expect(new Set(waitingCustomerIds).size).toBe(counts.waiting);
  expect(customers.filter(customer => customer.state === 'completed')).toHaveLength(counts.completed);
  expect(customers.filter(customer => customer.state === 'waiting').map(customer => customer.id)).toEqual(waitingCustomerIds);
  if (counts.waiting > 0) expect(counts.inService).toBe(s.configSnapshot.c);
  for (const customer of customers) {
    expect(customer.arrivalAt).toBeLessThan(s.configSnapshot.horizonSec);
    expect(customer.serviceDemandU).toBeGreaterThan(0);
    expect(customer.serviceDemandU).toBeLessThan(1);
    expect(customer.serviceSec).toBeGreaterThan(0);
    if (customer.serviceStartAt !== null) {
      expect(customer.serviceStartAt).toBeGreaterThanOrEqual(customer.arrivalAt);
      if (customer.state === 'inService') {
        const server = servers[customer.serverOrdinal!];
        expect(server.busyCustomerId).toBe(customer.id);
        close(server.departureAt!, customer.serviceStartAt + customer.serviceSec);
      }
      if (customer.departureAt !== null) close(customer.departureAt, customer.serviceStartAt + customer.serviceSec);
    } else expect(customer.state).toBe('waiting');
  }
  for (const server of servers) {
    if (server.busyCustomerId === null) expect(server.departureAt).toBeNull();
    else {
      const customer = customers.find(c => c.id === server.busyCustomerId)!;
      expect(customer.state).toBe('inService');
      expect(customer.serverOrdinal).toBe(server.ordinal);
      expect(server.departureAt).toBeGreaterThan(s.simTimeSec);
    }
  }
  for (const value of Object.values(s.integrals).flat()) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  if (s.countsAtH) expect(s.countsAtH.arrived).toBe(s.countsAtH.waiting + s.countsAtH.inService + s.countsAtH.completed);
}
function finalIdentities(s: Snapshot) {
  expect(s.status).toBe('COMPLETED');
  expect(s.validity).toBe('FINAL');
  expect(s.counts.completed).toBe(s.counts.arrived);
  expect(s.countsAtH!.arrived).toBe(s.counts.arrived);
  const sumWait = s.customers.reduce((sum, c) => sum + c.serviceStartAt! - c.arrivalAt, 0);
  const sumSystem = s.customers.reduce((sum, c) => sum + c.departureAt! - c.arrivalAt, 0);
  const sumService = s.customers.reduce((sum, c) => sum + c.departureAt! - c.serviceStartAt!, 0);
  close(s.integrals.queueAreaFull, sumWait);
  close(s.integrals.systemAreaFull, sumSystem);
  close(s.integrals.busyFull.reduce((a, b) => a + b, 0), sumService);
  if (s.customers.length) {
    const m = s.result!.cohortMetrics;
    close(m.meanTimeInSystemSec.value!, m.meanWaitSec.value! + m.meanServiceSec.value!);
  }
}

describe('FIFO mathematical fixtures', () => {
  it('ST-01 single server, nearest-rank P95, post-dispatch max queue', () => {
    const s = finish(fixture([0, 0, 0]));
    expect(starts(s)).toEqual([0, 10, 20]);
    expect(departures(s)).toEqual([10, 20, 30]);
    expect(s.result!.cohortMetrics).toEqual({
      meanWaitSec: { value: 10, reason: null }, p95WaitSec: { value: 20, reason: null },
      meanTimeInSystemSec: { value: 20, reason: null }, meanServiceSec: { value: 10, reason: null },
    });
    expect(s.integrals.queueAreaH).toBe(30);
    expect(s.integrals.busyH).toEqual([30]);
    expect(s.result!.horizonMetrics).toEqual({ meanQueue: 0.5, maxQueue: 2, throughputPerMinute: 3, utilization: 0.5, utilizationByServer: [0.5] });
    expect(s.result!.drainDurationSec).toBe(0);
    finalIdentities(s);
  });
  it('ST-02 dispatches lowest server ordinal and excludes in-service from queue', () => {
    const s = finish(fixture([0, 0, 0], 10, { c: 2 }));
    expect(starts(s)).toEqual([0, 0, 10]);
    expect(departures(s)).toEqual([10, 10, 20]);
    expect(s.customers.map(c => c.serverOrdinal)).toEqual([0, 1, 0]);
    close(s.result!.cohortMetrics.meanWaitSec.value!, 10 / 3);
    close(s.result!.cohortMetrics.meanTimeInSystemSec.value!, 40 / 3);
    expect(s.result!.cohortMetrics.p95WaitSec.value).toBe(10);
    expect(s.integrals.queueAreaH).toBe(10);
    expect(s.integrals.busyH).toEqual([20, 10]);
    close(s.result!.horizonMetrics.meanQueue, 1 / 6);
    expect(s.result!.horizonMetrics.utilization).toBe(0.25);
  });
  it('ST-03 departures precede arrivals at the same timestamp', () => {
    const engine = fixture([0, 10]); const s = finish(engine);
    expect(starts(s)).toEqual([0, 10]); expect(departures(s)).toEqual([10, 20]);
    expect(s.result!.horizonMetrics.maxQueue).toBe(0);
    expect(engine.getLedger().filter(e => e.atSimSec === 10).map(e => e.type)).toEqual(['departure', 'arrival', 'serviceStart']);
  });
  it('ST-04 excludes arrival H, drains customer crossing H', () => {
    const engine = fixture([50, 60], 20); engine.start();
    const h = engine.advanceTo(60);
    expect(h.countsAtH).toMatchObject({ arrived: 1, waiting: 0, inService: 1, completed: 0 });
    expect(h.integrals.busyH).toEqual([10]);
    const s = engine.advanceTo(1000);
    expect(s.simTimeSec).toBe(70);
    expect(s.result!.drainEndSec).toBe(70); expect(s.result!.drainDurationSec).toBe(10);
    expect(s.integrals.busyFull).toEqual([20]); expect(s.countsAtH).toEqual(h.countsAtH);
    close(s.result!.horizonMetrics.utilization, 1 / 6);
    expect(s.result!.cohortMetrics.meanTimeInSystemSec.value).toBe(20);
    expect(s.result!.horizonMetrics.throughputPerMinute).toBe(0);
  });
  it('ST-05 empty run reaches H with defined zero horizon metrics and null cohort', () => {
    const s = finish(createSimulation(config()));
    expect(s.simTimeSec).toBe(60); expect(s.counts.arrived).toBe(0);
    expect(s.integrals).toEqual({ queueAreaFull: 0, systemAreaFull: 0, queueAreaH: 0, systemAreaH: 0, busyFull: [0], busyH: [0] });
    for (const metric of Object.values(s.result!.cohortMetrics)) expect(metric).toEqual({ value: null, reason: 'NO_CUSTOMERS' });
    expect(Object.values(s.result!.horizonMetrics).flat()).toEqual([0, 0, 0, 0, 0]);
    expect(s.result!.drainDurationSec).toBe(0); finalIdentities(s);
  });
  it('SX-01 departure at H counts as completed at H', () => {
    const s = finish(fixture([50]));
    expect(s.countsAtH).toMatchObject({ completed: 1, inService: 0, waiting: 0 });
    expect(s.result!.horizonMetrics.throughputPerMinute).toBe(1);
    expect(s.result!.drainDurationSec).toBe(0); close(s.result!.horizonMetrics.utilization, 1 / 6);
  });
  it('SX-02 full and horizon integrals differ through drain', () => {
    const engine = fixture([50, 55], 20); engine.start(); const h = engine.advanceTo(60);
    expect(h.countsAtH).toMatchObject({ waiting: 1, inService: 1, completed: 0 });
    const s = engine.finish();
    expect(starts(s)).toEqual([50, 70]); expect(departures(s)).toEqual([70, 90]);
    expect(s.integrals.queueAreaH).toBe(5); expect(s.integrals.queueAreaFull).toBe(15);
    close(s.result!.horizonMetrics.meanQueue, 1 / 12);
    expect(s.result!.cohortMetrics.meanWaitSec.value).toBe(7.5);
    expect(s.result!.cohortMetrics.meanTimeInSystemSec.value).toBe(27.5);
    expect(s.result!.drainDurationSec).toBe(30); finalIdentities(s);
  });
  it('SX-03 keeps an older waiting customer ahead of a new arrival', () => {
    const s = finish(fixture([0, 0, 10]));
    expect(starts(s)).toEqual([0, 10, 20]); expect(s.result!.horizonMetrics.maxQueue).toBe(1);
    close(s.result!.cohortMetrics.meanWaitSec.value!, 20 / 3);
  });
  it('SX-04 auto precedes manual and both departures precede dispatch', () => {
    const engine = fixture([0, 0, 10], 10, { c: 2, manualSchedule: [manual(0, 10, [0])] });
    const s = finish(engine);
    expect(s.customers.map(c => [c.id, c.serviceStartAt, c.serverOrdinal])).toEqual([
      ['a:0', 0, 0], ['a:1', 0, 1], ['a:2', 10, 0], ['m:0', 10, 1],
    ]);
    expect(engine.getLedger().filter(e => e.atSimSec === 10).map(e => e.type)).toEqual(['departure', 'departure', 'arrival', 'arrival', 'serviceStart', 'serviceStart']);
  });
  it('SX-07 dispatch at H changes inServiceAtH but adds no horizon busy time', () => {
    const s = finish(fixture([50, 55]));
    expect(starts(s)).toEqual([50, 60]);
    expect(s.countsAtH).toMatchObject({ waiting: 0, inService: 1, completed: 1 });
    expect(s.integrals.busyH).toEqual([10]); expect(s.integrals.busyFull).toEqual([20]);
    expect(s.result!.horizonMetrics.maxQueue).toBe(1);
  });
  it('manual FIFO follows sequence and withinEntry order, never sorted ordinal/ID', () => {
    const s = finish(fixture([], 10, { manualSchedule: [manual(5, 0, [0]), manual(2, 0, [10, 2])] }));
    expect(s.customers.map(c => c.id)).toEqual(['m:10', 'm:2', 'm:0']);
    expect(starts(s)).toEqual([0, 10, 20]);
  });
});

describe('live input, replay and time observations', () => {
  it('ST-08/SX-05 pending paused input is accepted once and replay is canonical', () => {
    const engine = createSimulation(config()); engine.start(); engine.advanceTo(10); engine.pause();
    engine.enqueueManual(2); const pending = engine.enqueueManual(1);
    expect(pending.counts.arrived).toBe(0); expect(pending.pendingManual).toHaveLength(2);
    expect(pending.inputLog.map(e => e.atSimSec)).toEqual([10, 10]);
    expect(pending.inputLog.map(e => e.sequence)).toEqual([0, 1]);
    expect(starts(engine.resume())).toEqual([10, null, null]);
    const s = engine.finish();
    expect(starts(s)).toEqual([10, 20, 30]); expect(departures(s)).toEqual([20, 30, 40]);
    expect(s.result!.cohortMetrics.meanWaitSec.value).toBe(10);
    const replay = createSimulation(config(), 0, s.inputLog); const r = finish(replay);
    expect(r.customers).toEqual(s.customers); expect(r.integrals).toEqual(s.integrals);
    expect(replay.getLedger()).toEqual(engine.getLedger());
  });
  it('reopens only arrivals/dispatch at an observed timestamp with live/replay ledger parity', () => {
    const cfg = config({ manualSchedule: [manual(0, 0, [10])] });
    const engine = createSimulation(cfg); engine.start(); engine.advanceTo(10);
    engine.enqueueManual(1); engine.advanceTo(10); engine.enqueueManual(1); engine.advanceTo(10);
    const s = engine.finish(); const replay = createSimulation(cfg, 0, s.inputLog); const r = finish(replay);
    expect(r.customers).toEqual(s.customers); expect(replay.getLedger()).toEqual(engine.getLedger());
    expect(engine.getLedger().filter(e => e.type === 'departure' && e.customerId === 'm:10')).toHaveLength(1);
  });
  it('SX-06 observes no-event time and keeps provisional mean denominator at started', () => {
    const engine = fixture([15]); engine.start(); const s = engine.advanceTo(7);
    expect(s.simTimeSec).toBe(7); expect(s.counts.arrived).toBe(0);
    expect(s.provisionalMeanWait).toEqual({ metric: { value: null, reason: 'NOT_AVAILABLE_YET' }, started: 0 });
    const pending = engine.enqueueManual(3); expect(pending.inputLog[0].atSimSec).toBe(7); expect(pending.counts.arrived).toBe(0);
    const at7 = engine.advanceTo(7); expect(at7.provisionalMeanWait).toEqual({ metric: { value: 0, reason: null }, started: 1 });
    const at17 = engine.advanceTo(17); expect(at17.provisionalMeanWait).toEqual({ metric: { value: 5, reason: null }, started: 2 });
  });
  it('SX-10 promoted input runs once, retains identities/U and leaves a new log empty', () => {
    const cfg = config({ manualSchedule: [manual(4, 5, [7])] }); const engine = createSimulation(cfg);
    engine.start(); engine.advanceTo(10); engine.enqueueManual(2); const s = engine.finish();
    const promoted = finish(createSimulation(promoteManualLog(cfg, s.inputLog)));
    expect(promoted.customers).toEqual(s.customers); expect(promoted.inputLog).toEqual([]);
    const reset = finish(createSimulation(cfg)); expect(reset.customers.map(c => c.id)).toEqual(['m:7']);
  });
  it('chunked observation, repeated snapshot and ten pause cycles do not change RNG/results', () => {
    const cfg = config({ lambdaPerMinute: 15, serviceMinSec: 7, serviceMaxSec: 19, c: 3, horizonSec: 120 });
    const whole = createSimulation(cfg); const expected = finish(whole);
    const chunked = createSimulation(cfg); chunked.start();
    for (let index = 1; index <= 10; index++) {
      chunked.advanceTo(index * 7); const before = chunked.snapshot();
      expect(chunked.snapshot()).toEqual(before); chunked.pause(); chunked.resume();
      expect(chunked.snapshot()).toEqual(before);
    }
    const actual = chunked.finish(); expect(actual.customers).toEqual(expected.customers);
    expect(chunked.getLedger()).toEqual(whole.getLedger());
    for (const key of ['queueAreaH', 'queueAreaFull', 'systemAreaH', 'systemAreaFull'] as const) close(actual.integrals[key], expected.integrals[key]);
    actual.integrals.busyFull.forEach((value, index) => close(value, expected.integrals.busyFull[index]));
    expect(actual.result!.cohortMetrics).toEqual(expected.result!.cohortMetrics);
  });
  it('c/a/b retain paired demand and manual addition does not shift automatic demand', () => {
    const cfg = config({ lambdaPerMinute: 12, serviceMinSec: 10, serviceMaxSec: 30, manualSchedule: [manual(4, 5, [19, 3])] });
    const a = finish(createSimulation(cfg, 7)); const b = finish(createSimulation({ ...cfg, c: 4, serviceMinSec: 7, serviceMaxSec: 7 }, 7));
    expect(demand(a)).toEqual(demand(b));
    expect(b.customers.every(c => c.serviceSec === 7)).toBe(true);
    const noManual = finish(createSimulation({ ...cfg, manualSchedule: [] }, 7));
    expect(demand(a).filter(c => c.id.startsWith('a:'))).toEqual(demand(noManual));
  });
});

describe('resource limits, invalid inputs and detached boundaries', () => {
  const fullSchedule = () => Array.from({ length: 100 }, (_, entry) => manual(entry, 0, Array.from({ length: 20 }, (_, n) => entry * 20 + n)));
  it('ST-10 stops at candidate 2001 and conserves the accepted prefix', () => {
    const engine = fixture([1], 10, { manualSchedule: fullSchedule() }); engine.start(); const s = engine.advanceTo(1);
    expect(s.status).toBe('LIMIT_REACHED'); expect(s.stopReason).toMatchObject({ code: 'CUSTOMER_LIMIT', atSimSec: 1 });
    expect(s.counts.arrived).toBe(2000); expect(s.counts.automatic).toBe(0);
    expect(s.result).toBeNull(); expect(s.validity).toBe('INVALID'); invariant(s);
    expect(s.provisionalMeanWait.metric).toEqual({ value: null, reason: 'INVALID_RUN' });
  });
  it('overflow halfway through one timestamp dispatches its accepted prefix', () => {
    const engine = createFixtureSimulation(config({ c: 6 }), Array.from({ length: 2001 }, () => ({ atSimSec: 0, serviceSec: 10 })));
    const s = engine.start(); expect(s.status).toBe('LIMIT_REACHED');
    expect(s.counts).toMatchObject({ arrived: 2000, inService: 6, waiting: 1994 }); invariant(s);
  });
  it('partial live manual overflow keeps only the unarrived suffix pending and retains full accepted log', () => {
    const engine = createFixtureSimulation(config({ c: 6, serviceMinSec: 1, serviceMaxSec: 1 }),
      Array.from({ length: 1999 }, () => ({ atSimSec: 0, serviceSec: 1 })));
    engine.start(); engine.enqueueManual(2); const s = engine.advanceTo(0);
    expect(s.status).toBe('LIMIT_REACHED'); expect(s.counts.arrived).toBe(2000);
    expect(s.pendingManual).toHaveLength(1);
    expect(s.pendingManual[0]).toMatchObject({ count: 1, customerOrdinals: [1] });
    expect(s.inputLog[0]).toMatchObject({ count: 2, customerOrdinals: [0, 1] });
    expect(s.customers.filter(c => c.origin === 'manual').map(c => c.id)).toEqual(['m:0']);
    invariant(s);
  });
  it('ordinal exhaustion does not partially accept an action or change accepted log', () => {
    const engine = fixture([], 10, { manualSchedule: fullSchedule().map(e => ({ ...e, atSimSec: 50 })) });
    engine.start(); const before = engine.snapshot(); const after = engine.enqueueManual(1);
    expect(after.status).toBe('LIMIT_REACHED'); expect(after.stopReason!.code).toBe('MANUAL_ORDINAL_LIMIT');
    expect(after.inputLog).toEqual(before.inputLog); expect(after.pendingManual).toEqual(before.pendingManual);
    expect(after.counts).toEqual(before.counts); invariant(after);
    expect(() => engine.resume()).toThrow(); expect(engine.step()).toBe(false);
  });
  it('SX-11 rejects invalid live counts/targets/status and preserves state', () => {
    const engine = fixture([0], 100);
    expect(() => engine.enqueueManual(1)).toThrow(); expect(() => engine.advanceTo(1)).toThrow();
    engine.start(); engine.advanceTo(7);
    for (const count of [0, 21, 1.5, NaN, Infinity]) {
      const before = engine.snapshot(); expect(() => engine.enqueueManual(count)).toThrow(); expect(engine.snapshot()).toEqual(before);
    }
    for (const target of [6, NaN, Infinity]) {
      const before = engine.snapshot(); expect(() => engine.advanceTo(target)).toThrow(); expect(engine.snapshot()).toEqual(before);
    }
    engine.pause(); const paused = engine.snapshot(); expect(() => engine.advanceTo(8)).toThrow(); expect(engine.snapshot()).toEqual(paused);
    engine.resume(); engine.advanceTo(60); const atH = engine.snapshot();
    expect(() => engine.enqueueManual(1)).toThrow(); expect(engine.snapshot()).toEqual(atH);
  });
  it('rejects invalid schedules and fixture data before execution', () => {
    for (const schedule of [[manual(0, 60, [0])], [manual(0, NaN, [0])], [manual(0, 0, [0]), manual(1, 1, [0])], [manual(0, 0, [0]), manual(0, 1, [1])]]) {
      expect(() => createSimulation(config({ manualSchedule: schedule }))).toThrow();
    }
    expect(() => createSimulation(config({ manualSchedule: [...fullSchedule(), manual(100, 1, [0])] }))).toThrow();
    for (const arrivals of [[{ atSimSec: NaN, serviceSec: 10 }], [{ atSimSec: 0, serviceSec: Infinity }], [{ atSimSec: 0, serviceSec: 0 }], [{ atSimSec: 5, serviceSec: 10 }, { atSimSec: 4, serviceSec: 10 }]]) {
      expect(() => createFixtureSimulation(config(), arrivals)).toThrow();
    }
  });
  it('numeric failure is terminal and nonfinal instead of coercing arrival time', () => {
    const engine = createSimulation(config({ lambdaPerMinute: Number.MIN_VALUE })); const s = engine.snapshot();
    expect(s.status).toBe('ERROR'); expect(s.stopReason!.code).toBe('NUMERIC_ERROR');
    expect(s.validity).toBe('INVALID'); expect(s.result).toBeNull(); expect(s.counts.arrived).toBe(0);
    expect(() => engine.start()).toThrow(); invariant(s);
  });
  it('cancel is nonfinal and cannot overwrite committed completion', () => {
    const engine = fixture([0]); engine.start(); engine.pause(); const s = engine.cancel();
    expect(s.status).toBe('CANCELLED'); expect(s.result).toBeNull(); expect(s.validity).toBe('INVALID');
    expect(() => engine.resume()).toThrow(); expect(() => engine.finish()).toThrow();
    const done = fixture([]); const final = finish(done); expect(done.cancel()).toEqual(final);
  });
  it('copies config, replay log, snapshots, results, fixture arrays and ledger', () => {
    const cfg = config({ manualSchedule: [manual(0, 1, [5])] }); const log = [manual(1, 2, [3])];
    const engine = createSimulation(cfg, 0, log);
    cfg.manualSchedule[0].customerOrdinals[0] = 99; cfg.c = 6; log[0].atSimSec = 50;
    const before = engine.snapshot(); const exposed = engine.snapshot(); exposed.configSnapshot.c = 5; exposed.pendingManual[0].customerOrdinals[0] = 100;
    expect(engine.snapshot()).toEqual(before);
    const s = finish(engine); expect(s.customers.map(c => c.id)).toEqual(['m:5', 'm:3']);
    const ledger = engine.getLedger(); ledger[0].customerId = 'changed'; expect(engine.getLedger()[0].customerId).toBe('m:5');
    s.result!.configSnapshot.c = 4; s.result!.counts.completed = -1; s.customers[0].arrivalAt = 500;
    expect(engine.snapshot().result!.counts.completed).toBe(2); expect(engine.snapshot().configSnapshot.c).toBe(1);
    const arrivals = [{ atSimSec: 1, serviceSec: 10 }]; const f = createFixtureSimulation(config(), arrivals); arrivals[0].serviceSec = 100;
    expect(finish(f).customers[0].serviceSec).toBe(10);
  });
});

describe('fixed 100-seed invariant corpus (300 runs)', () => {
  it.each([
    { label: 'low', c: 2, lambdaPerMinute: 1, serviceMinSec: 1, serviceMaxSec: 5, horizonSec: 60 },
    { label: 'medium', c: 3, lambdaPerMinute: 8, serviceMinSec: 10, serviceMaxSec: 30, horizonSec: 120 },
    { label: 'overload', c: 1, lambdaPerMinute: 20, serviceMinSec: 50, serviceMaxSec: 100, horizonSec: 180 },
  ].flatMap(patch => Array.from({ length: 100 }, (_, rootSeed) => ({ ...patch, rootSeed }))))(
    '$label seed $rootSeed conserves every timestamp and satisfies final area identities', ({ label: _label, ...patch }) => {
      const engine = createSimulation(config({ ...patch, manualSchedule: [manual(0, 5, [7, 2])] }));
      let s = engine.start(); invariant(s); let previous = s.simTimeSec;
      while (s.status === 'RUNNING') {
        expect(engine.step()).toBe(true); s = engine.snapshot();
        expect(s.simTimeSec).toBeGreaterThanOrEqual(previous); previous = s.simTimeSec; invariant(s);
      }
      finalIdentities(s);
      expect(engine.step()).toBe(false);
  });
});
