import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimulationController } from '../../src/controller/client';
import type { Port } from '../../src/controller/client';
import { DEFAULT_CONFIG } from '../../src/domain/config';
import type { CommandEnvelope } from '../../src/workers/protocol';
import { createWorkerRuntime } from '../../src/workers/runtime';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// Ports deliver both directions as macrotasks, like postMessage; the worker yields the same way.
function setup() {
  let clock = 0;
  const frames: (() => void)[] = [];
  const ports: (Port & { sent: CommandEnvelope[]; deliver(data: unknown): void })[] = [];
  const createPort = () => {
    let alive = true;
    const port = {
      sent: [] as CommandEnvelope[], onmessage: null, onerror: null,
      postMessage(message: unknown) {
        port.sent.push(structuredClone(message) as CommandEnvelope);
        setTimeout(() => { if (alive) runtime.receive(structuredClone(message)); });
      },
      deliver(data: unknown) { port.onmessage?.({ data }); },
      terminate() { alive = false; },
    } as Port & { sent: CommandEnvelope[]; deliver(data: unknown): void };
    const runtime = createWorkerRuntime(
      reply => setTimeout(() => { if (alive) port.onmessage?.({ data: structuredClone(reply) }); }),
      task => setTimeout(task),
      () => clock,
    );
    ports.push(port);
    return port;
  };
  const controller = createSimulationController({ createPort, now: () => clock, requestFrame: callback => frames.push(callback) });
  const settle = () => vi.runAllTimersAsync();
  async function call<T>(promise: Promise<T>) { await settle(); return promise; }
  function runFrames(ms: number) {
    clock += ms;
    for (const callback of frames.splice(0)) callback();
  }
  async function frame(ms: number) {
    runFrames(ms);
    await settle();
  }
  const advances = () => ports.at(-1)!.sent.filter(m => m.payload.type === 'ADVANCE_TO');
  const time = () => controller.getView().state!.simTimeSec;
  return { controller, ports, frame, runFrames, call, settle, advances, time };
}

describe('controller pacing', () => {
  it('paces from real time, keeps one advance in flight and caps look-ahead at +1 s', async () => {
    const t = setup();
    expect(await t.call(t.controller.create(DEFAULT_CONFIG))).toMatchObject({ accepted: true, state: { status: 'READY' } });
    await t.call(t.controller.run());
    await t.frame(16);
    expect(t.time()).toBeCloseTo(0.32, 10);

    const sent = t.advances().length;
    t.runFrames(16);
    t.runFrames(16);
    t.runFrames(16);
    expect(t.advances()).toHaveLength(sent + 1);
    await t.settle();

    const before = t.time();
    await t.frame(1000);
    expect(t.time()).toBeCloseTo(before + 1, 10);
    expect(t.controller.getView().projection!.status).toBe('RUNNING');
  });

  it('pause stops pacing; resume and speed changes reanchor to the acknowledged time', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    await t.call(t.controller.run());
    await t.frame(30);
    expect(await t.call(t.controller.pause())).toMatchObject({ accepted: true, state: { status: 'PAUSED' } });
    const paused = t.time();
    const sent = t.advances().length;
    await t.frame(5000);
    expect(t.advances()).toHaveLength(sent);
    expect(t.time()).toBe(paused);

    await t.call(t.controller.resume());
    await t.frame(10);
    expect(t.time()).toBeCloseTo(paused + 0.2, 10);
    t.controller.setSpeed(1);
    await t.frame(500);
    expect(t.time()).toBeCloseTo(paused + 0.7, 10);
  });

  it('live input carries the worker timestamp from its ACK, not a main-thread clock', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    await t.call(t.controller.run());
    await t.frame(40);
    const add = await t.call(t.controller.addManual(3));
    expect(add.accepted).toBe(true);
    if (!add.accepted) return;
    expect(add.entry!.atSimSec).toBe(add.state.simTimeSec);
    expect(t.ports[0].sent.at(-1)!.payload).toEqual({ type: 'ADD_MANUAL', count: 3 });
    expect(t.controller.getView().projection!.inputLog).toEqual([add.entry]);
  });
});

describe('controller transitions and failures', () => {
  it('replay switches epoch, holds commands during the handshake and reproduces the result', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    await t.call(t.controller.run());
    await t.frame(50);
    await t.call(t.controller.addManual(2));
    await t.call(t.controller.fastFinish());
    const original = t.controller.getView().projection!;
    expect(original).toMatchObject({ status: 'COMPLETED', runId: 'run:1' });

    const replay = t.controller.replay();
    await expect(t.controller.run()).rejects.toThrow('Transisi');
    expect(t.controller.getView().transitioning).toBe(true);
    expect(await t.call(replay)).toMatchObject({ accepted: true, state: { status: 'RUNNING' } });
    expect(t.ports[0].sent.at(-1)).toMatchObject({ epoch: 2, jobId: 'run:2', commandSeq: 1, payload: { type: 'RUN' } });
    await t.call(t.controller.fastFinish());
    const replayed = t.controller.getView().projection!;
    expect(replayed).toMatchObject({ status: 'COMPLETED', runId: 'run:2', inputLog: original.inputLog });
    expect(replayed.result!.cohortMetrics).toEqual(original.result!.cohortMetrics);

    // A late reply from the old generation must not resurrect the previous run.
    t.ports[0].deliver({ protocolVersion: 1, epoch: 1, jobId: 'run:1', replyTo: null, snapshotRevision: 999, payload: { type: 'SNAPSHOT', projection: original } });
    expect(t.controller.getView().projection).toBe(replayed);
  });

  it('reset keeps parameters and base schedule, and a rejected transition keeps the epoch', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    expect(await t.call(t.controller.replay())).toMatchObject({ accepted: false, code: 'INVALID_STATE' });
    expect(t.controller.getView().transitioning).toBe(false);
    await t.call(t.controller.run());
    expect(t.ports[0].sent.at(-1)).toMatchObject({ epoch: 1, payload: { type: 'RUN' } });
    await t.frame(100);
    expect(await t.call(t.controller.reset())).toMatchObject({ accepted: true, nextEpoch: 2, state: { status: 'READY', simTimeSec: 0 } });
    expect(t.controller.getView().projection).toMatchObject({ status: 'READY', runId: 'run:2', configSnapshot: { c: 2, rootSeed: 2026 } });
  });

  it('a worker error rejects pending work and create() binds a fresh worker on a newer epoch', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    await t.call(t.controller.run());
    const pause = t.controller.pause();
    t.ports[0].onerror!(new Error('boom'));
    await expect(pause).rejects.toThrow('Worker simulasi');
    expect(t.controller.getView().failure).toMatch('Worker simulasi');
    await expect(t.controller.resume()).rejects.toThrow();

    await t.call(t.controller.create({ ...DEFAULT_CONFIG, c: 3 }));
    expect(t.ports).toHaveLength(2);
    expect(t.ports[1].sent[0]).toMatchObject({ epoch: 2, commandSeq: 1, payload: { type: 'CREATE_RUN', nextEpoch: 2, nextRunId: 'run:2' } });
    expect(t.controller.getView()).toMatchObject({ failure: null, state: { status: 'READY' }, projection: { configSnapshot: { c: 3 } } });
  });

  it('hidden pauses a running run, issues no more targets and refuses a gesture resume', async () => {
    const t = setup();
    await t.call(t.controller.create(DEFAULT_CONFIG));
    expect(await t.call(t.controller.pauseForHidden())).toBeNull();
    await t.call(t.controller.run());
    await t.frame(20);
    expect(await t.call(t.controller.pauseForHidden())).toMatchObject({ accepted: true, state: { status: 'PAUSED' } });
    expect(t.controller.getView().projection!.pauseReason).toBe('hidden');
    const sent = t.advances().length;
    await t.frame(10_000);
    expect(t.advances()).toHaveLength(sent);
    expect(await t.call(t.controller.resume('gesture'))).toMatchObject({ accepted: false, code: 'INVALID_STATE' });
    expect(await t.call(t.controller.resume('manual'))).toMatchObject({ accepted: true });
  });
});

describe('controller comparison', () => {
  const small = { ...DEFAULT_CONFIG, horizonSec: 120 };
  // Steps one macrotask at a time so a test can act while the batch is mid-way.
  async function until(done: () => boolean) {
    for (let step = 0; step < 200 && !done(); step++) await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  }
  it('binds a fresh worker, reports progress and keeps the last completed batch across a cancel', async () => {
    const t = setup();
    const started = t.controller.startComparison(small, { ...small, c: 3 });
    await until(() => t.controller.getView().comparison !== null);
    expect(t.controller.getView().comparison).toMatchObject({ status: 'starting', completedPairs: 0 });
    expect(await t.call(started)).toMatchObject({ accepted: true });
    await t.settle();
    const done = t.controller.getView();
    expect(done.state).toMatchObject({ status: 'READY' });
    expect(done.comparison).toMatchObject({ status: 'completed', completedPairs: 20 });
    expect(done.lastComparison).toBe(done.comparison);
    expect(done.comparison!.summary!.pairs).toBe(20);

    const second = t.controller.startComparison(small, small);
    await until(() => t.controller.getView().comparison?.status === 'running' && t.controller.getView().comparison!.completedPairs < 20);
    await t.call(t.controller.cancelComparison());
    await t.settle();
    await second;
    const view = t.controller.getView();
    expect(view.comparison).toMatchObject({ status: 'cancelled', summary: null });
    expect(view.lastComparison).toBe(done.comparison);
  });

  it('hidden suspends a running batch instead of pausing the parked visual run', async () => {
    const t = setup();
    await t.call(t.controller.create(small));
    const started = t.controller.startComparison(small, { ...small, c: 1 });
    await until(() => t.controller.getView().comparison?.status === 'running');
    await t.call(t.controller.pauseForHidden());
    await t.settle();
    await started;
    expect(t.controller.getView().comparison).toMatchObject({ status: 'suspended' });
    expect(t.controller.getView().state!.status).toBe('READY');
    await t.call(t.controller.resumeComparison());
    await t.settle();
    expect(t.controller.getView().comparison).toMatchObject({ status: 'completed', completedPairs: 20 });
  });
});
