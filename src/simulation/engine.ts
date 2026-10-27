import {
  appendManualEntry, MAX_CUSTOMERS, promoteManualLog, validateConfig, VERSIONS,
} from '../domain/config';
import type { ManualEntry, ScenarioConfig } from '../domain/config';
import { calculateCohortMetrics, provisionalMeanWait } from './metrics';
import type { CohortMetrics } from './metrics';
import { createStream, exponentialGap, serviceDuration, toUniform } from './rng';

export type RunStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR' | 'LIMIT_REACHED' | 'CANCELLED';
export type Customer = {
  id: string;
  origin: 'auto' | 'manual';
  arrivalAt: number;
  serviceDemandU: number;
  serviceSec: number;
  serviceStartAt: number | null;
  departureAt: number | null;
  serverOrdinal: number | null;
  state: 'waiting' | 'inService' | 'completed';
};
type Server = { ordinal: number; customerIndex: number | null; departureAt: number | null };
type Counts = {
  arrived: number; automatic: number; manual: number; waiting: number; inService: number; completed: number;
};
type Integrals = {
  queueAreaFull: number; systemAreaFull: number; queueAreaH: number; systemAreaH: number;
  busyFull: number[]; busyH: number[];
};
type StopReason = {
  code: 'CUSTOMER_LIMIT' | 'MANUAL_ORDINAL_LIMIT' | 'NUMERIC_ERROR' | 'INVARIANT_FAILURE' | 'CANCELLED';
  message: string;
  atSimSec: number;
  attempted?: { id?: string; count: number };
};
export type ModelEvent = {
  atSimSec: number; type: 'departure' | 'arrival' | 'serviceStart'; customerId: string;
  serverOrdinal: number | null; origin: 'auto' | 'manual'; sourceIndex: number; withinEntry: number;
};
export type RunResult = {
  validity: 'FINAL';
  configSnapshot: ScenarioConfig;
  inputLog: ManualEntry[];
  versions: typeof VERSIONS;
  replicationIndex: number;
  counts: Counts;
  countsAtH: Counts;
  cohortMetrics: CohortMetrics;
  horizonMetrics: {
    throughputPerMinute: number; meanQueue: number; maxQueue: number;
    utilization: number; utilizationByServer: number[];
  };
  drainEndSec: number;
  drainDurationSec: number;
};

// Fixture arrivals use the same processor as production; they are not a UI distribution option.
export type FixtureArrival = { atSimSec: number; serviceSec: number };

class Simulation {
  private readonly config: ScenarioConfig;
  private readonly replicationIndex: number;
  private status: RunStatus = 'READY';
  private time = 0;
  private phase: 'arrivalsOpen' | 'draining' = 'arrivalsOpen';
  private customers: Customer[] = [];
  private queue: number[] = [];
  private head = 0;
  private servers: Server[];
  private automatic = 0;
  private completed = 0;
  private inputLog: ManualEntry[];
  private pending: ManualEntry[];
  private countsAtH: Counts | null = null;
  private maxQueue = 0;
  private integrals: Integrals;
  private stopReason: StopReason | null = null;
  private result: RunResult | null = null;
  private events: ModelEvent[] = [];
  private identities = new Map<string, { sourceIndex: number; withinEntry: number }>();
  private autoIndex = 0;
  private nextAutoTime = Infinity;
  private readonly arrivalRng: () => number;
  private readonly serviceRng: [() => number, () => number];
  private readonly serviceCache: [number[], number[]] = [[], []];
  private readonly fixtures?: FixtureArrival[];

  constructor(input: unknown, replicationIndex: number, replayLog: ManualEntry[], fixtures?: FixtureArrival[]) {
    this.config = validateConfig(input);
    this.replicationIndex = replicationIndex;
    this.arrivalRng = createStream(this.config.rootSeed, replicationIndex, 0);
    this.serviceRng = [createStream(this.config.rootSeed, replicationIndex, 1), createStream(this.config.rootSeed, replicationIndex, 2)];
    const combined = promoteManualLog(this.config, replayLog).manualSchedule;
    this.inputLog = combined.slice(this.config.manualSchedule.length);
    this.pending = combined.sort((a, b) => a.atSimSec - b.atSimSec || a.sequence - b.sequence);
    this.servers = Array.from({ length: this.config.c }, (_, ordinal) => ({ ordinal, customerIndex: null, departureAt: null }));
    this.integrals = {
      queueAreaFull: 0, systemAreaFull: 0, queueAreaH: 0, systemAreaH: 0,
      busyFull: Array(this.config.c).fill(0), busyH: Array(this.config.c).fill(0),
    };
    this.fixtures = fixtures;
    try { this.scheduleNextAutomatic(0); }
    catch { this.fail('ERROR', 'NUMERIC_ERROR', 'Jeda kedatangan tidak dapat dihitung secara finite.'); }
  }

  private counts(): Counts {
    const inService = this.servers.filter(server => server.customerIndex !== null).length;
    return {
      arrived: this.customers.length, automatic: this.automatic, manual: this.customers.length - this.automatic,
      waiting: this.queue.length - this.head, inService, completed: this.completed,
    };
  }

  snapshot() {
    const invalid = this.status === 'ERROR' || this.status === 'LIMIT_REACHED' || this.status === 'CANCELLED';
    const provisional = invalid
      ? { metric: { value: null, reason: 'INVALID_RUN' as const }, started: this.customers.filter(c => c.serviceStartAt !== null).length }
      : provisionalMeanWait(this.customers);
    return structuredClone({
      status: this.status, simTimeSec: this.time, phase: this.phase,
      validity: invalid ? 'INVALID' as const : this.status === 'COMPLETED' ? 'FINAL' as const : 'PROVISIONAL' as const,
      configSnapshot: this.config, versions: VERSIONS, replicationIndex: this.replicationIndex,
      inputLog: this.inputLog, pendingManual: this.pending, counts: this.counts(), countsAtH: this.countsAtH,
      customers: this.customers,
      servers: this.servers.map(server => ({
        ordinal: server.ordinal,
        busyCustomerId: server.customerIndex === null ? null : this.customers[server.customerIndex].id,
        departureAt: server.departureAt,
      })),
      waitingCustomerIds: this.queue.slice(this.head).map(index => this.customers[index].id),
      integrals: this.integrals, provisionalMeanWait: provisional,
      stopReason: this.stopReason, result: this.result,
    });
  }

  getLedger(): ModelEvent[] {
    const phase = { departure: 0, arrival: 1, serviceStart: 2 };
    return this.events.map(event => ({ ...event })).sort((a, b) =>
      a.atSimSec - b.atSimSec || phase[a.type] - phase[b.type]
      || (a.type === 'arrival'
        ? Number(a.origin === 'manual') - Number(b.origin === 'manual') || a.sourceIndex - b.sourceIndex || a.withinEntry - b.withinEntry
        : a.serverOrdinal! - b.serverOrdinal!));
  }

  start() {
    this.requireStatus('READY');
    this.status = 'RUNNING';
    return this.advanceTo(this.time);
  }

  pause() {
    this.requireStatus('RUNNING');
    this.status = 'PAUSED';
    return this.snapshot();
  }

  resume() {
    this.requireStatus('PAUSED');
    this.status = 'RUNNING';
    return this.advanceTo(this.time);
  }

  advanceTo(targetSimSec: number) {
    this.observe(targetSimSec);
    return this.snapshot();
  }

  // Same as advanceTo without cloning a snapshot; the worker calls it once per acknowledged target.
  observe(targetSimSec: number) {
    this.requireStatus('RUNNING');
    if (!Number.isFinite(targetSimSec) || targetSimSec < this.time) throw new RangeError('Waktu tujuan harus finite dan tidak boleh mundur.');
    while (this.status === 'RUNNING' && this.nextTimestamp() <= targetSimSec) this.step();
    if (this.status === 'RUNNING') {
      try { this.integrate(targetSimSec); this.assertInvariants(); }
      catch { this.fail('ERROR', 'INVARIANT_FAILURE', 'State atau perhitungan simulasi tidak valid.'); }
    }
  }

  progress() {
    return { status: this.status, phase: this.phase, simTimeSec: this.time, nextEventAt: this.nextTimestamp() };
  }

  // One complete timestamp is the cooperative checkpoint for the future worker adapter.
  step(): boolean {
    if (this.status !== 'RUNNING') return false;
    const timestamp = this.nextTimestamp();
    try {
      this.integrate(timestamp);
      for (const server of this.servers) {
        if (server.customerIndex !== null && server.departureAt === timestamp) {
          const customer = this.customers[server.customerIndex];
          customer.departureAt = timestamp;
          customer.state = 'completed';
          this.completed++;
          this.record('departure', customer, server.ordinal);
          server.customerIndex = null;
          server.departureAt = null;
        }
      }
      while (this.nextAutoTime === timestamp && timestamp < this.config.horizonSec && this.status === 'RUNNING') {
        const fixture = this.fixtures?.[this.autoIndex];
        this.arrive('auto', this.autoIndex, this.autoIndex, 0, fixture?.serviceSec);
        if (this.status !== 'RUNNING') break;
        this.autoIndex++;
        this.scheduleNextAutomatic(timestamp);
      }
      while (this.pending[0]?.atSimSec === timestamp && this.status === 'RUNNING') {
        const entry = this.pending[0];
        let accepted = 0;
        for (let index = 0; index < entry.count; index++) {
          this.arrive('manual', entry.customerOrdinals[index], entry.sequence, index);
          if (this.status !== 'RUNNING') break;
          accepted++;
        }
        if (this.status === 'RUNNING') this.pending.shift();
        else this.pending[0] = {
          ...entry, count: entry.count - accepted, customerOrdinals: entry.customerOrdinals.slice(accepted),
        };
      }
      this.dispatch();
      if (timestamp < this.config.horizonSec) this.maxQueue = Math.max(this.maxQueue, this.queue.length - this.head);
      if (timestamp === this.config.horizonSec && this.countsAtH === null) {
        this.phase = 'draining';
        this.countsAtH = this.counts();
      }
      try { this.assertInvariants(); }
      catch {
        this.fail('ERROR', 'INVARIANT_FAILURE', 'State simulasi melanggar invariant.');
        return true;
      }
      if (this.status === 'RUNNING' && this.countsAtH !== null && this.completed === this.customers.length) this.complete();
    } catch (error) {
      this.fail('ERROR', 'NUMERIC_ERROR', error instanceof Error ? error.message : 'Perhitungan simulasi tidak valid.');
    }
    return true;
  }

  enqueueManual(count: number) {
    this.requireStatus('RUNNING', 'PAUSED');
    if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new RangeError('Jumlah pelanggan harus bilangan bulat 1–20.');
    if (this.time >= this.config.horizonSec) throw new RangeError('Kedatangan telah ditutup.');
    const schedule = [...this.config.manualSchedule, ...this.inputLog];
    const allocated = schedule.reduce((total, entry) => total + entry.count, 0);
    if (allocated + count > MAX_CUSTOMERS) {
      this.fail('LIMIT_REACHED', 'MANUAL_ORDINAL_LIMIT', 'Ordinal pelanggan manual telah mencapai batas.', { count });
      return this.snapshot();
    }
    const { entry } = appendManualEntry(schedule, this.config.horizonSec, this.time, count);
    // Validate the full promoted configuration before accepting a live log entry.
    promoteManualLog(this.config, [...this.inputLog, entry]);
    this.inputLog.push(entry);
    this.pending.push(entry);
    this.pending.sort((a, b) => a.atSimSec - b.atSimSec || a.sequence - b.sequence);
    return this.snapshot();
  }

  finish() {
    this.requireStatus('RUNNING', 'PAUSED');
    if (this.status === 'PAUSED') this.resume();
    while (this.status === 'RUNNING') this.step();
    return this.snapshot();
  }

  cancel() {
    if (this.status === 'RUNNING' || this.status === 'PAUSED') {
      this.fail('CANCELLED', 'CANCELLED', 'Run dibatalkan; hasil parsial bukan hasil final.');
    }
    return this.snapshot();
  }

  private requireStatus(...allowed: RunStatus[]) {
    if (!allowed.includes(this.status)) throw new RangeError(`Aksi tidak tersedia pada status ${this.status}.`);
  }

  private fail(status: 'ERROR' | 'LIMIT_REACHED' | 'CANCELLED', code: StopReason['code'], message: string, attempted?: StopReason['attempted']) {
    this.status = status;
    this.stopReason = { code, message, atSimSec: this.time, ...(attempted ? { attempted } : {}) };
  }

  private scheduleNextAutomatic(previous: number) {
    if (this.fixtures) this.nextAutoTime = this.fixtures[this.autoIndex]?.atSimSec ?? Infinity;
    else if (this.config.lambdaPerMinute === 0) this.nextAutoTime = Infinity;
    else {
      const next = previous + exponentialGap(toUniform(this.arrivalRng()), this.config.lambdaPerMinute);
      if (!Number.isFinite(next) || next <= previous) throw new RangeError('Waktu kedatangan harus finite dan terus maju.');
      this.nextAutoTime = next;
    }
    if (this.nextAutoTime >= this.config.horizonSec) this.nextAutoTime = Infinity;
  }

  private nextTimestamp(): number {
    return Math.min(
      this.nextAutoTime,
      this.pending[0]?.atSimSec ?? Infinity,
      this.countsAtH === null ? this.config.horizonSec : Infinity,
      ...this.servers.map(server => server.departureAt ?? Infinity),
    );
  }

  private integrate(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp < this.time) throw new RangeError('Jam simulasi tidak valid.');
    const dt = timestamp - this.time;
    const dtH = Math.max(0, Math.min(timestamp, this.config.horizonSec) - Math.min(this.time, this.config.horizonSec));
    const counts = this.counts();
    this.integrals.queueAreaFull += counts.waiting * dt;
    this.integrals.systemAreaFull += (counts.waiting + counts.inService) * dt;
    this.integrals.queueAreaH += counts.waiting * dtH;
    this.integrals.systemAreaH += (counts.waiting + counts.inService) * dtH;
    for (const server of this.servers) {
      if (server.customerIndex !== null) {
        this.integrals.busyFull[server.ordinal] += dt;
        this.integrals.busyH[server.ordinal] += dtH;
      }
    }
    this.time = timestamp;
  }

  private arrive(origin: Customer['origin'], ordinal: number, sourceIndex: number, withinEntry: number, fixtureService?: number) {
    const id = `${origin === 'auto' ? 'a' : 'm'}:${ordinal}`;
    if (this.customers.length === MAX_CUSTOMERS) {
      this.fail('LIMIT_REACHED', 'CUSTOMER_LIMIT', 'Batas 2.000 pelanggan tercapai.', { id, count: 1 });
      return;
    }
    if (this.identities.has(id)) throw new Error('Identitas pelanggan ganda.');
    const domainIndex = origin === 'auto' ? 0 : 1;
    const cache = this.serviceCache[domainIndex];
    while (cache.length <= ordinal) cache.push(toUniform(this.serviceRng[domainIndex]()));
    const serviceDemandU = cache[ordinal];
    const customer: Customer = {
      id, origin, arrivalAt: this.time, serviceDemandU,
      serviceSec: fixtureService ?? serviceDuration(serviceDemandU, this.config.serviceMinSec, this.config.serviceMaxSec),
      serviceStartAt: null, departureAt: null, serverOrdinal: null, state: 'waiting',
    };
    this.identities.set(id, { sourceIndex, withinEntry });
    this.queue.push(this.customers.length);
    this.customers.push(customer);
    if (origin === 'auto') this.automatic++;
    this.record('arrival', customer, null);
  }

  private dispatch() {
    for (const server of this.servers) {
      if (server.customerIndex !== null || this.head === this.queue.length) continue;
      const index = this.queue[this.head++];
      const customer = this.customers[index];
      const departureAt = this.time + customer.serviceSec;
      if (!Number.isFinite(departureAt) || departureAt <= this.time) throw new Error('Waktu selesai layanan tidak valid.');
      customer.serviceStartAt = this.time;
      customer.serverOrdinal = server.ordinal;
      customer.state = 'inService';
      server.customerIndex = index;
      server.departureAt = departureAt;
      this.record('serviceStart', customer, server.ordinal);
    }
  }

  private record(type: ModelEvent['type'], customer: Customer, serverOrdinal: number | null) {
    this.events.push({
      atSimSec: this.time, type, customerId: customer.id, serverOrdinal, origin: customer.origin,
      ...this.identities.get(customer.id)!,
    });
  }

  private assertInvariants() {
    const counts = this.counts();
    if (counts.arrived !== counts.waiting + counts.inService + counts.completed || counts.inService > this.config.c
      || (counts.waiting > 0 && counts.inService < this.config.c) || this.identities.size !== counts.arrived) {
      throw new Error('Konservasi pelanggan atau kapasitas loket tidak terpenuhi.');
    }
    const queued = new Set(this.queue.slice(this.head));
    if (queued.size !== counts.waiting) throw new Error('Pelanggan ganda di antrean.');
    let waiting = 0;
    let completed = 0;
    let inService = 0;
    for (let index = 0; index < this.customers.length; index++) {
      const customer = this.customers[index];
      if (!Number.isFinite(customer.arrivalAt) || !Number.isFinite(customer.serviceSec)
        || customer.serviceSec <= 0 || customer.arrivalAt >= this.config.horizonSec) throw new Error('Waktu pelanggan tidak valid.');
      if (customer.state === 'waiting') {
        waiting++;
        if (!queued.has(index) || customer.serviceStartAt !== null || customer.departureAt !== null) throw new Error('State antrean tidak valid.');
      } else {
        if (queued.has(index) || customer.serviceStartAt === null || customer.serviceStartAt < customer.arrivalAt
          || !Number.isFinite(customer.serviceStartAt) || customer.serverOrdinal === null) throw new Error('State layanan tidak valid.');
        if (customer.state === 'completed') {
          completed++;
          if (customer.departureAt !== customer.serviceStartAt + customer.serviceSec || customer.departureAt > this.time) throw new Error('Departure tidak valid.');
        } else {
          inService++;
          if (this.servers[customer.serverOrdinal].customerIndex !== index || customer.departureAt !== null) throw new Error('Assignment loket tidak valid.');
        }
      }
    }
    if (waiting !== counts.waiting || completed !== counts.completed || inService !== counts.inService) throw new Error('Count state tidak cocok.');
    for (const server of this.servers) {
      if (server.customerIndex !== null) {
        const customer = this.customers[server.customerIndex];
        if (customer.state !== 'inService' || customer.serverOrdinal !== server.ordinal
          || server.departureAt !== customer.serviceStartAt! + customer.serviceSec || server.departureAt <= this.time) throw new Error('Assignment balik loket tidak valid.');
      } else if (server.departureAt !== null) throw new Error('Loket idle memiliki departure.');
    }
    for (const value of [this.time, ...Object.values(this.integrals).flat()]) {
      if (!Number.isFinite(value) || value < 0) throw new Error('Integral tidak finite atau negatif.');
    }
    if (this.countsAtH && this.countsAtH.arrived !== this.countsAtH.waiting + this.countsAtH.inService + this.countsAtH.completed) throw new Error('Count horizon tidak terkonservasi.');
  }

  private complete() {
    const horizon = this.config.horizonSec;
    this.result = {
      validity: 'FINAL', configSnapshot: this.config, inputLog: this.inputLog, versions: VERSIONS,
      replicationIndex: this.replicationIndex, counts: this.counts(), countsAtH: this.countsAtH!,
      cohortMetrics: calculateCohortMetrics(this.customers),
      horizonMetrics: {
        throughputPerMinute: this.countsAtH!.completed / (horizon / 60),
        meanQueue: this.integrals.queueAreaH / horizon, maxQueue: this.maxQueue,
        utilization: this.integrals.busyH.reduce((sum, value) => sum + value, 0) / (this.config.c * horizon),
        utilizationByServer: this.integrals.busyH.map(value => value / horizon),
      },
      drainEndSec: this.time, drainDurationSec: Math.max(0, this.time - horizon),
    };
    this.status = 'COMPLETED';
  }
}

export type Snapshot = ReturnType<Simulation['snapshot']>;
export type RunState = Pick<Snapshot, 'status' | 'phase' | 'simTimeSec'>;

export function createSimulation(config: unknown, replicationIndex = 0, replayLog: ManualEntry[] = []) {
  return new Simulation(config, replicationIndex, replayLog);
}

export function createFixtureSimulation(config: unknown, arrivals: FixtureArrival[]) {
  if (!Array.isArray(arrivals) || arrivals.length > MAX_CUSTOMERS + 1) throw new RangeError('Fixture arrival tidak valid.');
  const copied: FixtureArrival[] = [];
  for (const arrival of arrivals) {
    if (!arrival || !Number.isFinite(arrival.atSimSec) || arrival.atSimSec < 0
      || !Number.isFinite(arrival.serviceSec) || arrival.serviceSec < 1 || arrival.serviceSec > 300
      || (copied.length > 0 && arrival.atSimSec < copied[copied.length - 1].atSimSec)) throw new RangeError('Fixture arrival harus berurutan dan finite.');
    copied.push({ atSimSec: arrival.atSimSec, serviceSec: arrival.serviceSec });
  }
  return new Simulation(config, 0, [], copied);
}
