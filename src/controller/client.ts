import type { ManualEntry } from '../domain/config';
import type { RunState } from '../simulation/engine';
import { PROTOCOL_VERSION } from '../workers/protocol';
import type { Ack, Command, PauseReason, Projection, ReplyEnvelope } from '../workers/protocol';

export type Port = {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
  terminate(): void;
};
export type Speed = 1 | 5 | 20;
export type ControllerView = {
  projection: Projection | null;
  state: RunState | null;
  speed: Speed;
  transitioning: boolean;
  failure: string | null;
};
type Pending = { resolve: (ack: Ack) => void; reject: (error: Error) => void; control: boolean };

// Each ADVANCE_TO may look at most this far past the last acknowledged time (ARCHITECTURE §7.1).
const MAX_LOOKAHEAD_SEC = 1;

export function createWorkerPort(): Port {
  return new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' }) as unknown as Port;
}

/**
 * Main-thread side of the protocol: paces ADVANCE_TO from real time, keeps one advance in flight,
 * reanchors on every control ACK and ignores replies from older epochs or snapshot revisions.
 * Real time only chooses targets; manual arrivals are stamped by the worker.
 */
export function createSimulationController({
  createPort = createWorkerPort,
  now = () => performance.now(),
  requestFrame = (callback: () => void) => requestAnimationFrame(callback),
}: { createPort?: () => Port; now?: () => number; requestFrame?: (callback: () => void) => unknown } = {}) {
  let port: Port | null = null;
  let epochCounter = 0;
  let epoch = 0;
  let runId = '';
  let seq = 0;
  let lastRevision = 0;
  let transitionSeq: number | null = null;
  let advanceSeq: number | null = null;
  let controlsInFlight = 0;
  let fastMode = false;
  let looping = false;
  let disposed = false;
  let anchor = { sim: 0, real: 0 };
  let lastAckSim = 0;
  const pending = new Map<number, Pending>();
  const listeners = new Set<(view: ControllerView) => void>();
  let view: ControllerView = { projection: null, state: null, speed: 20, transitioning: false, failure: null };

  function update(patch: Partial<ControllerView>) {
    view = { ...view, ...patch };
    for (const listener of listeners) listener(view);
  }

  function reanchor(state: RunState) {
    lastAckSim = state.simTimeSec;
    anchor = { sim: state.simTimeSec, real: now() };
  }

  function post(command: Command) {
    const commandSeq = ++seq;
    port!.postMessage({ protocolVersion: PROTOCOL_VERSION, epoch, jobId: runId, commandSeq, payload: command });
    return commandSeq;
  }

  function request(command: Command, control: boolean): Promise<Ack> {
    if (disposed || !port || view.failure) return Promise.reject(new Error('Worker simulasi tidak tersedia.'));
    if (transitionSeq !== null) return Promise.reject(new Error('Transisi run sedang berlangsung.'));
    const commandSeq = post(command);
    if (control) controlsInFlight++;
    return new Promise((resolve, reject) => pending.set(commandSeq, { resolve, reject, control }));
  }

  const control = (command: Command) => request(command, true);

  // Reset, replay and replacement: commands are held until the old epoch acknowledges the switch.
  function replace(command: { type: 'RESET_RUN' } | { type: 'REPLAY_RUN' } | { type: 'CREATE_RUN'; config: unknown; replayLog?: ManualEntry[] }) {
    const nextEpoch = epoch + 1;
    epochCounter = Math.max(epochCounter, nextEpoch);
    const before = seq;
    const promise = request({ ...command, nextEpoch, nextRunId: `run:${nextEpoch}` }, false);
    if (seq !== before) {
      transitionSeq = seq;
      update({ transitioning: true });
    }
    return promise;
  }

  function fail(message: string) {
    port?.terminate();
    port = null;
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
    transitionSeq = advanceSeq = null;
    controlsInFlight = 0;
    update({ failure: message, transitioning: false });
  }

  function receive(data: unknown) {
    const reply = data as ReplyEnvelope;
    if (typeof reply !== 'object' || reply === null || reply.protocolVersion !== PROTOCOL_VERSION) {
      fail('Protokol worker tidak cocok; muat ulang aplikasi.');
      return;
    }
    const { payload } = reply;
    if (transitionSeq !== null && reply.epoch === epoch && reply.replyTo === transitionSeq && payload.type === 'ACK') {
      const entry = pending.get(transitionSeq)!;
      pending.delete(transitionSeq);
      transitionSeq = null;
      if (payload.accepted) {
        epoch = payload.nextEpoch!;
        runId = payload.nextRunId!;
        seq = lastRevision = 0;
        advanceSeq = null;
        fastMode = false;
        reanchor(payload.state);
        update({ projection: null, state: payload.state, transitioning: false });
      } else update({ transitioning: false });
      entry.resolve(payload);
      return;
    }
    if (reply.epoch !== epoch || reply.jobId !== runId) return;
    if (payload.type === 'SNAPSHOT') {
      if (reply.snapshotRevision <= lastRevision) return;
      lastRevision = reply.snapshotRevision;
      fastMode = payload.projection.fastMode;
      const { status, phase, simTimeSec } = payload.projection;
      update({ projection: payload.projection, state: { status, phase, simTimeSec } });
    } else if (payload.type === 'ADVANCED') {
      if (reply.replyTo === advanceSeq) advanceSeq = null;
      lastAckSim = payload.state.simTimeSec;
      update({ state: payload.state });
    } else {
      if (reply.replyTo === advanceSeq) advanceSeq = null;
      const entry = reply.replyTo === null ? undefined : pending.get(reply.replyTo);
      if (entry) {
        pending.delete(reply.replyTo!);
        if (entry.control) controlsInFlight--;
        if (payload.accepted && payload.command === 'FAST_FINISH') fastMode = true;
        entry.resolve(payload);
      }
      if (payload.state) {
        reanchor(payload.state);
        update({ state: payload.state });
      }
    }
    schedulePacing();
  }

  const pacing = () => !disposed && port !== null && !view.failure && transitionSeq === null
    && !fastMode && view.state?.status === 'RUNNING';

  function schedulePacing() {
    if (looping || !pacing()) return;
    looping = true;
    requestFrame(tick);
  }

  function tick() {
    looping = false;
    if (!pacing()) return;
    if (advanceSeq === null && controlsInFlight === 0) {
      const target = Math.min(anchor.sim + (now() - anchor.real) / 1000 * view.speed, lastAckSim + MAX_LOOKAHEAD_SEC);
      if (target > lastAckSim) advanceSeq = post({ type: 'ADVANCE_TO', targetSimSec: target });
    }
    schedulePacing();
  }

  function create(config: unknown, replayLog?: ManualEntry[]) {
    if (port && !view.failure) return replace({ type: 'CREATE_RUN', config, ...(replayLog ? { replayLog } : {}) });
    // A new (or replacement after failure) worker is unbound; it binds to the next session epoch.
    port = createPort();
    port.onmessage = event => receive(event.data);
    port.onerror = port.onmessageerror = () => fail('Worker simulasi berhenti karena error.');
    epoch = ++epochCounter;
    runId = `run:${epoch}`;
    seq = lastRevision = 0;
    advanceSeq = null;
    fastMode = false;
    update({ failure: null, projection: null, state: null });
    return request({ type: 'CREATE_RUN', config, ...(replayLog ? { replayLog } : {}), nextEpoch: epoch, nextRunId: runId }, false);
  }

  return {
    getView: () => view,
    subscribe(listener: (view: ControllerView) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    create,
    run: () => control({ type: 'RUN' }),
    pause: (reason: PauseReason = 'manual') => control({ type: 'PAUSE_RUN', reason }),
    resume: (source: 'manual' | 'gesture' = 'manual') => control({ type: 'RESUME_RUN', source }),
    addManual: (count: number) => control({ type: 'ADD_MANUAL', count }),
    fastFinish: () => control({ type: 'FAST_FINISH' }),
    cancelFast: () => control({ type: 'CANCEL_FAST' }),
    reset: () => replace({ type: 'RESET_RUN' }),
    async replay() {
      const ack = await replace({ type: 'REPLAY_RUN' });
      return ack.accepted ? control({ type: 'RUN' }) : ack;
    },
    setSpeed(speed: Speed) {
      anchor = { sim: lastAckSim, real: now() };
      update({ speed });
    },
    // Tab hidden: stop issuing targets at once and pause a running visual or fast run; no catch-up later.
    pauseForHidden() {
      return view.state?.status === 'RUNNING' ? control({ type: 'PAUSE_RUN', reason: 'hidden' }) : Promise.resolve(null);
    },
    dispose() {
      disposed = true;
      fail('Controller sudah ditutup.');
      listeners.clear();
    },
  };
}

export type SimulationController = ReturnType<typeof createSimulationController>;
