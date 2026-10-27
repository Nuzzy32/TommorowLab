import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/domain/config';
import type { ManualEntry, ScenarioConfig } from '../../src/domain/config';
import { createSimulation } from '../../src/simulation/engine';
import type { Ack, Command, Projection, Reply, ReplyEnvelope } from '../../src/workers/protocol';
import { createWorkerRuntime } from '../../src/workers/runtime';

const cfg = (patch: Partial<ScenarioConfig> = {}): ScenarioConfig => ({ ...DEFAULT_CONFIG, ...patch });
const overload = cfg({ c: 2, lambdaPerMinute: 20, horizonSec: 1800 });
const manual = (sequence: number, atSimSec: number, customerOrdinals: number[]): ManualEntry => ({
  id: `entry:${sequence}`, sequence, atSimSec, count: customerOrdinals.length, customerOrdinals,
});
const close = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-8, 1e-10 * Math.max(Math.abs(actual), Math.abs(expected))));

// Deterministic stand-in for the worker: replies are recorded, yielded slices wait in `tasks`.
function harness(now = () => 0) {
  const replies: ReplyEnvelope[] = [];
  const tasks: (() => void)[] = [];
  const runtime = createWorkerRuntime(reply => replies.push(structuredClone(reply)), task => tasks.push(task), now);
  const h = {
    replies, tasks, epoch: 1, jobId: 'run:1', seq: 0,
    raw: (message: unknown) => runtime.receive(message),
    send(payload: Command, patch: Record<string, unknown> = {}) {
      const commandSeq = (patch.commandSeq as number | undefined) ?? ++h.seq;
      runtime.receive({ protocolVersion: 1, epoch: h.epoch, jobId: h.jobId, commandSeq, payload, ...patch });
      return commandSeq;
    },
    drain() { while (tasks.length) tasks.shift()!(); },
    // Latest match wins: sequence numbers restart in every epoch.
    to: (seq: number) => replies.filter(reply => reply.replyTo === seq).map(reply => reply.payload),
    ack: (seq: number) => h.to(seq).filter((reply): reply is Ack => reply.type === 'ACK').at(-1)!,
    advanced: (seq: number) => h.to(seq).filter(reply => reply.type === 'ADVANCED').at(-1) as Extract<Reply, { type: 'ADVANCED' }> | undefined,
    snapshots: () => replies.filter(reply => reply.payload.type === 'SNAPSHOT'),
    projection: () => (h.snapshots().at(-1)!.payload as { projection: Projection }).projection,
    create(config: unknown = DEFAULT_CONFIG) {
      return h.send({ type: 'CREATE_RUN', config, nextEpoch: h.epoch, nextRunId: h.jobId });
    },
    switchTo(epoch: number) { h.epoch = epoch; h.jobId = `run:${epoch}`; h.seq = 0; },
  };
  return h;
}

describe('worker handshake, envelope guards and duplicates', () => {
  it('binds only through CREATE_RUN on the chosen epoch and rejects mismatched envelopes', () => {
    const h = harness();
    expect(h.ack(h.send({ type: 'RUN' }))).toMatchObject({ accepted: false, code: 'NOT_BOUND', state: null });
    h.raw({ protocolVersion: 2, epoch: 1, jobId: 'run:1', commandSeq: 9, payload: { type: 'RUN' } });
    expect(h.replies.at(-1)).toMatchObject({ replyTo: 9, epoch: 1, payload: { code: 'PROTOCOL_MISMATCH' } });
    h.raw({ protocolVersion: 1, epoch: 1, jobId: 'run:1', commandSeq: 10, payload: { type: 'EVAL' } });
    expect(h.replies.at(-1)!.payload).toMatchObject({ code: 'MALFORMED' });
    h.raw(null);
    expect(h.replies.at(-1)).toMatchObject({ epoch: -1, replyTo: null, payload: { code: 'MALFORMED' } });
    expect(h.ack(h.create(cfg({ c: 7 })))).toMatchObject({ accepted: false, code: 'INVALID_INPUT' });

    const created = h.create();
    expect(h.ack(created)).toMatchObject({ accepted: true, state: { status: 'READY', simTimeSec: 0 } });
    expect(h.snapshots()).toHaveLength(1);
    expect(h.snapshots()[0]).toMatchObject({ epoch: 1, jobId: 'run:1', snapshotRevision: 1 });
    expect(h.ack(h.send({ type: 'RUN' }, { epoch: 0 }))).toMatchObject({ code: 'STALE_EPOCH', state: null });
    expect(h.ack(h.send({ type: 'RUN' }, { jobId: 'run:other' }))).toMatchObject({ code: 'STALE_JOB' });
    expect(h.ack(h.send({ type: 'RUN' }))).toMatchObject({ accepted: true, state: { status: 'RUNNING' } });
  });

  it('SX-09 replays the stored reply for a duplicate command and never re-executes it', () => {
    const h = harness();
    h.create(); h.send({ type: 'RUN' }); h.send({ type: 'PAUSE_RUN', reason: 'manual' });
    const add = h.send({ type: 'ADD_MANUAL', count: 2 });
    const first = h.replies.find(reply => reply.replyTo === add)!;
    h.send({ type: 'ADD_MANUAL', count: 2 }, { commandSeq: add });
    expect(h.replies.filter(reply => reply.replyTo === add)).toEqual([first, first]);
    expect(h.projection().inputLog).toHaveLength(1);

    for (let index = 0; index < 33; index++) { h.send({ type: 'RESUME_RUN', source: 'manual' }); h.send({ type: 'PAUSE_RUN', reason: 'manual' }); }
    h.send({ type: 'ADD_MANUAL', count: 2 }, { commandSeq: add });
    expect(h.replies.at(-1)!.payload).toMatchObject({ accepted: false, code: 'DUPLICATE' });
    expect(h.projection().inputLog).toHaveLength(1);
  });

  it('rejects malformed live input with the canonical state and leaves the run unchanged', () => {
    const h = harness();
    h.create(cfg({ horizonSec: 60, lambdaPerMinute: 0 })); h.send({ type: 'RUN' });
    const before = h.projection();
    for (const count of [0, 21, 1.5, NaN]) {
      expect(h.ack(h.send({ type: 'ADD_MANUAL', count }))).toMatchObject({ accepted: false, code: 'INVALID_INPUT', state: { status: 'RUNNING' } });
    }
    h.raw({ protocolVersion: 1, epoch: 1, jobId: 'run:1', commandSeq: ++h.seq, payload: { type: 'ADVANCE_TO', targetSimSec: Infinity } });
    expect(h.replies.at(-1)!.payload).toMatchObject({ code: 'MALFORMED' });
    expect(h.ack(h.send({ type: 'PAUSE_RUN', reason: 'manual' }))).toMatchObject({ accepted: true });
    expect(h.projection()).toMatchObject({ inputLog: before.inputLog, counts: before.counts, simTimeSec: 0 });
  });
});

describe('epoch transitions', () => {
  it('reset acks on the old epoch before the new generation snapshot and keeps only the base schedule', () => {
    const base = [manual(0, 30, [5])];
    const h = harness();
    h.create(cfg({ manualSchedule: base })); h.send({ type: 'RUN' });
    h.send({ type: 'ADVANCE_TO', targetSimSec: 10 }); h.drain();
    h.send({ type: 'ADD_MANUAL', count: 2 });
    expect(h.projection().inputLog).toHaveLength(1);
    expect(h.ack(h.send({ type: 'RESET_RUN', nextEpoch: 5, nextRunId: 'run:5' }))).toMatchObject({ accepted: false, code: 'INVALID_INPUT' });

    const advance = h.send({ type: 'ADVANCE_TO', targetSimSec: 900 });
    expect(h.tasks.length).toBeGreaterThan(0);
    const before = h.replies.length;
    const reset = h.send({ type: 'RESET_RUN', nextEpoch: 2, nextRunId: 'run:2' });
    const after = h.replies.slice(before);
    expect(after.map(reply => [reply.epoch, reply.payload.type])).toEqual([[1, 'ACK'], [2, 'SNAPSHOT']]);
    expect(after[0]).toMatchObject({ replyTo: reset, payload: { accepted: true, nextEpoch: 2, nextRunId: 'run:2', state: { status: 'READY', simTimeSec: 0 } } });
    expect(after[1]).toMatchObject({ jobId: 'run:2', snapshotRevision: 1 });
    expect(h.projection()).toMatchObject({ status: 'READY', inputLog: [], pendingManual: base, configSnapshot: { manualSchedule: base } });
    h.drain();
    expect(h.advanced(advance)).toBeUndefined();
    expect(h.replies).toHaveLength(before + 2);

    expect(h.ack(h.send({ type: 'RUN' }))).toMatchObject({ code: 'STALE_EPOCH' });
    h.switchTo(2);
    expect(h.ack(h.send({ type: 'RUN' }))).toMatchObject({ accepted: true, state: { status: 'RUNNING' } });
    expect(h.replies.at(-1)).toMatchObject({ epoch: 2, snapshotRevision: 2 });
  });

  it('replay is only for completed runs and reproduces the same input log once', () => {
    const h = harness();
    h.create(cfg({ horizonSec: 120 })); h.send({ type: 'RUN' });
    expect(h.ack(h.send({ type: 'REPLAY_RUN', nextEpoch: 2, nextRunId: 'run:2' }))).toMatchObject({ code: 'INVALID_STATE' });
    h.send({ type: 'ADVANCE_TO', targetSimSec: 40 }); h.drain(); h.send({ type: 'ADD_MANUAL', count: 3 });
    h.send({ type: 'FAST_FINISH' }); h.drain();
    const original = h.projection();
    expect(original.status).toBe('COMPLETED');
    h.send({ type: 'REPLAY_RUN', nextEpoch: 2, nextRunId: 'run:2' }); h.switchTo(2);
    expect(h.projection()).toMatchObject({ status: 'READY', inputLog: original.inputLog, pendingManual: original.inputLog });
    h.send({ type: 'RUN' }); h.send({ type: 'FAST_FINISH' }); h.drain();
    expect(h.projection().result).toEqual(original.result);
  });
});

describe('cooperative slices, interruption and live timestamps', () => {
  it('yields after at most 100 timestamp groups and a pause interrupts at that checkpoint', () => {
    const h = harness();
    h.create(overload); h.send({ type: 'RUN' });
    const advance = h.send({ type: 'ADVANCE_TO', targetSimSec: 1800 });
    expect(h.tasks).toHaveLength(1);
    expect(h.advanced(advance)).toBeUndefined();
    expect(h.ack(h.send({ type: 'ADVANCE_TO', targetSimSec: 1800 }))).toMatchObject({ accepted: false, code: 'BUSY' });

    const pause = h.send({ type: 'PAUSE_RUN', reason: 'manual' });
    const interrupted = h.advanced(advance)!;
    expect(interrupted.outcome).toBe('interrupted');
    expect(h.replies.findIndex(reply => reply.replyTo === advance)).toBeLessThan(h.replies.findIndex(reply => reply.replyTo === pause));
    const direct = createSimulation(overload); direct.start();
    for (let index = 0; index < 100; index++) direct.step();
    expect(h.ack(pause).state).toEqual({ ...interrupted.state, status: 'PAUSED' });
    expect(h.ack(pause).state!.simTimeSec).toBe(direct.progress().simTimeSec);

    const count = h.replies.length;
    h.drain();
    expect(h.replies).toHaveLength(count);
    expect(h.projection()).toMatchObject({ status: 'PAUSED', simTimeSec: direct.progress().simTimeSec });
  });

  it('the 4 ms budget also ends a slice before 100 groups', () => {
    let clock = 0;
    const h = harness(() => clock++);
    h.create(overload); h.send({ type: 'RUN' });
    h.send({ type: 'ADVANCE_TO', targetSimSec: 1800 });
    expect(h.tasks).toHaveLength(1);
    const direct = createSimulation(overload); direct.start();
    for (let index = 0; index < 100; index++) direct.step();
    h.send({ type: 'PAUSE_RUN', reason: 'manual' });
    expect(h.projection().simTimeSec).toBeLessThan(direct.progress().simTimeSec);
  });

  it('SX-06 stamps live input with the canonical worker time, including at an advance checkpoint', () => {
    let clock = 0;
    const h = harness(() => (clock += 1000)); // every snapshot passes the 100 ms throttle
    h.create(cfg({ c: 1, lambdaPerMinute: 0, serviceMinSec: 30, serviceMaxSec: 30, horizonSec: 60, manualSchedule: [manual(0, 15, [9])] }));
    h.send({ type: 'RUN' });
    expect(h.advanced(h.send({ type: 'ADVANCE_TO', targetSimSec: 7 }))).toMatchObject({ outcome: 'reached', state: { simTimeSec: 7 } });
    const add = h.ack(h.send({ type: 'ADD_MANUAL', count: 3 }));
    expect(add).toMatchObject({ accepted: true, state: { simTimeSec: 7 }, entry: { atSimSec: 7, count: 3, sequence: 1, customerOrdinals: [0, 1, 2] } });
    expect(h.projection().counts.arrived).toBe(0);
    h.send({ type: 'ADVANCE_TO', targetSimSec: 7 }); h.drain();
    expect(h.projection()).toMatchObject({ simTimeSec: 7, counts: { arrived: 3, inService: 1, waiting: 2 } });
    h.send({ type: 'ADVANCE_TO', targetSimSec: 60 }); h.drain();
    expect(h.ack(h.send({ type: 'ADD_MANUAL', count: 1 }))).toMatchObject({
      accepted: false, code: 'INVALID_INPUT', state: { status: 'RUNNING', phase: 'draining', simTimeSec: 60 },
    });
    expect(h.projection().inputLog).toHaveLength(1);

    const busy = harness();
    busy.create(overload); busy.send({ type: 'RUN' });
    const advance = busy.send({ type: 'ADVANCE_TO', targetSimSec: 1800 });
    const live = busy.ack(busy.send({ type: 'ADD_MANUAL', count: 2 }));
    expect(busy.advanced(advance)!.outcome).toBe('interrupted');
    expect(live.accepted && live.entry!.atSimSec).toBe(live.state!.simTimeSec);
    expect(live.state!.simTimeSec).toBeGreaterThan(0);
  });

  it('ARC-QA-02 a worker-paced run with pauses and live input matches the direct engine replay', () => {
    const h = harness();
    h.create(); h.send({ type: 'RUN' });
    for (let target = 37.3; h.projection().status !== 'COMPLETED'; target += 37.3) {
      h.send({ type: 'ADVANCE_TO', targetSimSec: target }); h.drain();
      if (Math.round(target / 37.3) % 4 === 0) {
        h.send({ type: 'PAUSE_RUN', reason: 'manual' });
        if (target < 900) h.send({ type: 'ADD_MANUAL', count: 2 });
        h.send({ type: 'RESUME_RUN', source: 'manual' });
      }
    }
    const worker = h.projection();
    expect(worker.inputLog.length).toBeGreaterThan(3);
    const direct = createSimulation(DEFAULT_CONFIG, 0, worker.inputLog); direct.start();
    const expected = direct.finish();
    expect(worker.result!.inputLog).toEqual(expected.result!.inputLog);
    expect(worker.counts).toEqual(expected.counts);
    expect(worker.countsAtH).toEqual(expected.countsAtH);
    expect(worker.result!.cohortMetrics).toEqual(expected.result!.cohortMetrics);
    expect(worker.result!.drainEndSec).toBe(expected.result!.drainEndSec);
    for (const key of ['meanQueue', 'utilization', 'throughputPerMinute', 'maxQueue'] as const) {
      close(worker.result!.horizonMetrics[key], expected.result!.horizonMetrics[key]);
    }
  });
});

describe('fast finish, cancel and hidden', () => {
  it('FR-34 fast finish from PAUSED equals the direct result and yields while it runs', () => {
    const h = harness();
    h.create(overload); h.send({ type: 'RUN' });
    h.send({ type: 'ADVANCE_TO', targetSimSec: 50 }); h.drain();
    h.send({ type: 'PAUSE_RUN', reason: 'manual' });
    expect(h.ack(h.send({ type: 'FAST_FINISH' }))).toMatchObject({ accepted: true, state: { status: 'RUNNING' } });
    expect(h.tasks.length).toBe(1);
    expect(h.ack(h.send({ type: 'ADD_MANUAL', count: 1 }))).toMatchObject({ code: 'BUSY' });
    expect(h.ack(h.send({ type: 'ADVANCE_TO', targetSimSec: 60 }))).toMatchObject({ code: 'BUSY' });
    h.drain();
    const done = h.projection();
    expect(done).toMatchObject({ status: 'COMPLETED', fastMode: false, validity: 'FINAL' });
    const direct = createSimulation(overload); direct.start();
    expect(done.result).toEqual(direct.finish().result);
  });

  it('SX-12 cancel is nonfinal, and a completion committed first wins over a late cancel', () => {
    const h = harness();
    h.create(overload); h.send({ type: 'RUN' }); h.send({ type: 'FAST_FINISH' });
    expect(h.ack(h.send({ type: 'CANCEL_FAST' }))).toMatchObject({ accepted: true, state: { status: 'CANCELLED' } });
    const count = h.replies.length;
    h.drain();
    expect(h.replies).toHaveLength(count);
    expect(h.projection()).toMatchObject({ status: 'CANCELLED', validity: 'INVALID', result: null, stopReason: { code: 'CANCELLED' } });
    expect(h.ack(h.send({ type: 'RESUME_RUN', source: 'manual' }))).toMatchObject({ code: 'INVALID_STATE' });

    const late = harness();
    late.create(); late.send({ type: 'RUN' }); late.send({ type: 'FAST_FINISH' }); late.drain();
    expect(late.ack(late.send({ type: 'CANCEL_FAST' }))).toMatchObject({ accepted: false, code: 'INVALID_STATE', state: { status: 'COMPLETED' } });
    expect(late.projection()).toMatchObject({ status: 'COMPLETED', validity: 'FINAL' });
  });

  it('hidden pause stops fast mode and only a manual resume continues', () => {
    const h = harness();
    expect(h.create()).toBe(1);
    expect(h.ack(h.send({ type: 'PAUSE_RUN', reason: 'hidden' }))).toMatchObject({ code: 'INVALID_STATE', state: { status: 'READY' } });
    h.send({ type: 'RUN' }); h.send({ type: 'FAST_FINISH' });
    expect(h.ack(h.send({ type: 'PAUSE_RUN', reason: 'hidden' }))).toMatchObject({ accepted: true, state: { status: 'PAUSED' } });
    h.drain();
    expect(h.projection()).toMatchObject({ status: 'PAUSED', fastMode: false, pauseReason: 'hidden' });
    expect(h.ack(h.send({ type: 'RESUME_RUN', source: 'gesture' }))).toMatchObject({ code: 'INVALID_STATE' });
    expect(h.ack(h.send({ type: 'RESUME_RUN', source: 'manual' }))).toMatchObject({ accepted: true, state: { status: 'RUNNING' } });
    expect(h.projection().pauseReason).toBeNull();
  });
});

it('projection caps the avatar sample at 150 and keeps canonical counts', () => {
  const schedule = Array.from({ length: 10 }, (_, entry) => manual(entry, 0, Array.from({ length: 20 }, (_, n) => entry * 20 + n)));
  const h = harness();
  h.create(cfg({ lambdaPerMinute: 0, manualSchedule: schedule })); h.send({ type: 'RUN' });
  const projection = h.projection();
  expect(projection.counts).toMatchObject({ arrived: 200, inService: 2, waiting: 198 });
  expect(projection.waitingSample).toHaveLength(148);
  expect(projection.waitingSample[0]).toBe('m:2');
  expect(projection.summarizedWaiting).toBe(50);
  expect(projection).not.toHaveProperty('customers');
});
