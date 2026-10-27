import { ValidationError, validateConfig } from '../domain/config';
import type { ScenarioConfig } from '../domain/config';
import { demandMismatch, PAIRS, paramChanges, replicationSummary, sameDemand, summarize } from '../simulation/comparison';
import type { PairResult, ReplicationSummary } from '../simulation/comparison';
import { createSimulation } from '../simulation/engine';
import type { RunStatus, Snapshot } from '../simulation/engine';
import { parseCommand, project, PROTOCOL_VERSION, ProtocolError } from './protocol';
import type { Command, ComparisonReport, ComparisonStatus, PauseReason, RejectCode, Reply, ReplyEnvelope } from './protocol';

type Engine = ReturnType<typeof createSimulation>;
type Job = { kind: 'advance' | 'fast'; seq: number; target: number };
/** One serial batch: pair r runs A then B on the same demand; the visual run stays parked meanwhile. */
type Batch = {
  id: string; a: ScenarioConfig; b: ScenarioConfig; identical: boolean; suspended: boolean;
  r: number; side: 'a' | 'b'; sim: Engine; first: { summary: ReplicationSummary; customers: Snapshot['customers'] } | null;
  pairs: PairResult[];
};
// Commands that would compute or replace the visual run; refused while a batch owns the worker.
const VISUAL_COMPUTE = new Set<Command['type']>(['CREATE_RUN', 'RESET_RUN', 'REPLAY_RUN', 'RUN', 'ADVANCE_TO', 'RESUME_RUN', 'ADD_MANUAL', 'FAST_FINISH']);

// Design budgets from ARCHITECTURE §6.3/§7.2; real latency still needs the reference-device benchmark.
const SLICE_MS = 4;
const SLICE_GROUPS = 100;
const SNAPSHOT_MS = 100;
const ACK_CACHE = 64;

class Rejection extends Error {
  constructor(readonly code: RejectCode, message: string) { super(message); }
}

/**
 * Owns the canonical run inside the simulation worker. `schedule` must queue a macrotask so
 * PAUSE/CANCEL messages are handled between slices; `now` is real time for the slice budget only.
 */
export function createWorkerRuntime(
  post: (reply: ReplyEnvelope) => void,
  schedule: (task: () => void) => void,
  now: () => number,
) {
  let epoch: number | null = null;
  let runId = '';
  let engine: Engine | null = null;
  let lastSeq = 0;
  let revision = 0;
  let job: Job | null = null;
  let pauseReason: PauseReason | null = null;
  let lastSnapshotAt = -Infinity;
  let batch: Batch | null = null;
  const replies = new Map<number, ReplyEnvelope>();

  const state = (sim = engine!) => {
    const { status, phase, simTimeSec } = sim.progress();
    return { status, phase, simTimeSec };
  };

  function send(replyTo: number | null, payload: Reply, replyEpoch = epoch ?? -1, jobId = runId) {
    const reply: ReplyEnvelope = { protocolVersion: PROTOCOL_VERSION, epoch: replyEpoch, jobId, replyTo, snapshotRevision: revision, payload };
    post(reply);
    return reply;
  }

  function remember(seq: number, reply: ReplyEnvelope) {
    replies.set(seq, reply);
    if (replies.size > ACK_CACHE) replies.delete(replies.keys().next().value!);
  }

  function ack(seq: number, command: Command, extra: object = {}) {
    remember(seq, send(seq, { type: 'ACK', command: command.type, accepted: true, state: state(), ...extra }));
  }

  function snapshot(force: boolean) {
    if (!force && now() - lastSnapshotAt < SNAPSHOT_MS) return;
    lastSnapshotAt = now();
    revision++;
    send(null, { type: 'SNAPSHOT', projection: project(engine!.snapshot(), runId, job?.kind === 'fast', pauseReason) });
  }

  // Stops the active job at the current checkpoint; an interrupted advance is answered, never resumed.
  function interrupt() {
    const current = job;
    job = null;
    if (current?.kind === 'advance') send(current.seq, { type: 'ADVANCED', outcome: 'interrupted', state: state() });
  }

  function finishJob(current: Job, outcome: 'reached' | 'stopped') {
    job = null;
    if (current.kind === 'advance') send(current.seq, { type: 'ADVANCED', outcome, state: state() });
    snapshot(outcome === 'stopped' || current.kind === 'fast');
  }

  // Processes whole timestamp groups; a group is never split for pause, snapshot or yield.
  function work(current: Job) {
    if (job !== current) return;
    const sim = engine!;
    const started = now();
    try {
      // Budget is checked after each group so every slice makes progress even on a slow clock.
      for (let groups = 1; ; groups++) {
        const { status, nextEventAt } = sim.progress();
        if (status !== 'RUNNING') return finishJob(current, 'stopped');
        if (nextEventAt > current.target) {
          sim.observe(current.target);
          return finishJob(current, sim.progress().status === 'RUNNING' ? 'reached' : 'stopped');
        }
        sim.step();
        if (groups >= SLICE_GROUPS || now() - started >= SLICE_MS) {
          snapshot(false);
          schedule(() => work(current));
          return;
        }
      }
    } catch (error) {
      job = null;
      send(current.seq, { type: 'ACK', command: null, accepted: false, code: 'INTERNAL', message: String(error), state: state() });
      snapshot(true);
    }
  }

  function report(current: Batch, status: ComparisonStatus, message: string | null = null, replyTo: number | null = null) {
    const payload: ComparisonReport = {
      type: 'COMPARISON', batchId: current.id, status, completedPairs: current.pairs.length, a: current.a, b: current.b,
      pairs: status === 'completed' ? current.pairs : [], message,
      summary: status === 'completed' ? summarize(current.pairs, current.identical) : null,
    };
    send(replyTo, payload, epoch!, current.id);
  }

  function endBatch(current: Batch, status: ComparisonStatus, message: string | null = null) {
    batch = null;
    report(current, status, message);
  }

  const startSide = (config: ScenarioConfig, r: number) => {
    const sim = createSimulation(config, r);
    sim.start();
    return sim;
  };

  // Same slice budget as the visual run; suspend/cancel are handled between slices.
  function batchWork(current: Batch) {
    if (batch !== current || current.suspended) return;
    const started = now();
    try {
      for (let groups = 1; ; groups++) {
        const status = current.sim.progress().status;
        if (status === 'RUNNING') {
          current.sim.step();
        } else {
          const done = current.sim.snapshot();
          if (status !== 'COMPLETED' || !done.result) {
            return endBatch(current, 'invalid', `Pasangan ${current.r + 1} sisi ${current.side.toUpperCase()} berhenti: ${done.stopReason?.message ?? status}. Kurangi durasi atau kedatangan.`);
          }
          const summary = replicationSummary(done.result);
          if (current.side === 'a') {
            current.first = { summary, customers: done.customers };
            current.side = 'b';
            current.sim = startSide(current.b, current.r);
          } else {
            if (!sameDemand(current.first!.customers, done.customers)) {
              return endBatch(current, 'invalid', `Permintaan pasangan ${current.r + 1} tidak identik antara A dan B.`);
            }
            current.pairs.push({ r: current.r, a: current.first!.summary, b: summary });
            current.first = null;
            if (current.pairs.length === PAIRS) return endBatch(current, 'completed');
            current.r++;
            current.side = 'a';
            current.sim = startSide(current.a, current.r);
            report(current, 'running');
          }
        }
        if (groups >= SLICE_GROUPS || now() - started >= SLICE_MS) {
          schedule(() => batchWork(current));
          return;
        }
      }
    } catch (error) {
      endBatch(current, 'invalid', error instanceof Error ? error.message : String(error));
    }
  }

  function owned(batchId: string) {
    if (!batch || batch.id !== batchId) throw new Rejection('INVALID_STATE', 'Tidak ada perbandingan aktif dengan ID ini.');
    return batch;
  }

  // Reset, replay and replacement: ACK on the old epoch first, then the new generation's snapshot.
  function replace(seq: number, command: Extract<Command, { nextEpoch: number }>, create: () => Engine) {
    if (command.nextEpoch !== epoch! + 1) throw new Rejection('INVALID_INPUT', 'nextEpoch harus epoch aktif + 1.');
    const next = create();
    job = null;
    send(seq, { type: 'ACK', command: command.type, accepted: true, state: state(next), nextEpoch: command.nextEpoch, nextRunId: command.nextRunId });
    engine = next;
    epoch = command.nextEpoch;
    runId = command.nextRunId;
    lastSeq = 0;
    revision = 0;
    replies.clear();
    pauseReason = null;
    snapshot(true);
  }

  function handle(seq: number, command: Command) {
    const sim = engine!;
    const current = sim.progress().status;
    const need = (...allowed: RunStatus[]) => {
      if (!allowed.includes(current)) throw new Rejection('INVALID_STATE', `Aksi tidak tersedia pada status ${current}.`);
    };
    if (batch && VISUAL_COMPUTE.has(command.type)) throw new Rejection('BUSY', 'Perbandingan A/B sedang berjalan; tunggu atau batalkan dulu.');
    switch (command.type) {
      case 'START_COMPARISON': {
        if (batch) throw new Rejection('BUSY', 'Perbandingan lain masih berjalan.');
        if (current === 'RUNNING') throw new Rejection('BUSY', 'Pause run terlebih dahulu; run dan perbandingan tidak dihitung bersamaan.');
        const a = validateConfig(command.a);
        const b = validateConfig(command.b);
        const mismatch = demandMismatch(a, b);
        if (mismatch.length) throw new Rejection('INVALID_INPUT', `Permintaan A dan B harus sama; berbeda pada ${mismatch.join(', ')}.`);
        const next: Batch = {
          id: command.batchId, a, b, identical: paramChanges(a, b).length === 0, suspended: false,
          r: 0, side: 'a', sim: startSide(a, 0), first: null, pairs: [],
        };
        batch = next;
        ack(seq, command);
        report(next, 'running');
        schedule(() => batchWork(next));
        return;
      }
      case 'SUSPEND_COMPARISON': {
        const target = owned(command.batchId);
        if (target.suspended) throw new Rejection('INVALID_STATE', 'Perbandingan sudah ditangguhkan.');
        target.suspended = true;
        ack(seq, command);
        return report(target, 'suspended');
      }
      case 'RESUME_COMPARISON': {
        const target = owned(command.batchId);
        if (!target.suspended) throw new Rejection('INVALID_STATE', 'Perbandingan tidak sedang ditangguhkan.');
        target.suspended = false;
        ack(seq, command);
        report(target, 'running');
        schedule(() => batchWork(target));
        return;
      }
      case 'CANCEL_COMPARISON': {
        // A batch that completed before this message wins; cancel is then a rejected no-op.
        const target = owned(command.batchId);
        ack(seq, command);
        return endBatch(target, 'cancelled');
      }
      case 'CREATE_RUN':
        return replace(seq, command, () => createSimulation(command.config, 0, command.replayLog ?? []));
      case 'RESET_RUN': {
        const { configSnapshot } = sim.snapshot();
        return replace(seq, command, () => createSimulation(configSnapshot));
      }
      case 'REPLAY_RUN': {
        need('COMPLETED');
        const { configSnapshot, inputLog } = sim.snapshot();
        return replace(seq, command, () => createSimulation(configSnapshot, 0, inputLog));
      }
      case 'RUN':
        need('READY');
        sim.start();
        ack(seq, command);
        return snapshot(true);
      case 'ADVANCE_TO':
        need('RUNNING');
        if (job) throw new Rejection('BUSY', job.kind === 'fast' ? 'Penyelesaian cepat sedang berjalan.' : 'Advance sebelumnya belum selesai.');
        if (command.targetSimSec < sim.progress().simTimeSec) throw new Rejection('INVALID_INPUT', 'Waktu tujuan tidak boleh mundur.');
        job = { kind: 'advance', seq, target: command.targetSimSec };
        return work(job);
      case 'PAUSE_RUN':
        need('RUNNING');
        interrupt();
        sim.pause();
        pauseReason = command.reason;
        ack(seq, command);
        return snapshot(true);
      case 'RESUME_RUN':
        need('PAUSED');
        if (command.source === 'gesture' && pauseReason === 'hidden') {
          throw new Rejection('INVALID_STATE', 'Jeda karena tab tidak aktif hanya dapat dilanjutkan secara manual.');
        }
        sim.resume();
        pauseReason = null;
        ack(seq, command);
        return snapshot(true);
      case 'ADD_MANUAL': {
        need('RUNNING', 'PAUSED');
        if (job?.kind === 'fast') throw new Rejection('BUSY', 'Tambah pelanggan tidak tersedia selama penyelesaian cepat.');
        // Validated before interrupting; the entry is stamped with the worker's canonical time.
        const after = sim.enqueueManual(command.count);
        interrupt();
        if (after.status === 'LIMIT_REACHED') {
          remember(seq, send(seq, { type: 'ACK', command: command.type, accepted: false, code: 'LIMIT_REACHED', message: after.stopReason!.message, state: state() }));
        } else ack(seq, command, { entry: after.inputLog.at(-1) });
        return snapshot(true);
      }
      case 'FAST_FINISH':
        need('RUNNING', 'PAUSED');
        if (job?.kind === 'fast') throw new Rejection('BUSY', 'Penyelesaian cepat sudah berjalan.');
        interrupt();
        if (current === 'PAUSED') sim.resume();
        pauseReason = null;
        job = { kind: 'fast', seq, target: Infinity };
        ack(seq, command);
        snapshot(true); // the UI switches to "Batalkan penyelesaian" without waiting for the throttle
        return work(job);
      case 'CANCEL_FAST':
        // A completion committed before this message wins; the cancel is then a rejected no-op.
        if (job?.kind !== 'fast') throw new Rejection('INVALID_STATE', 'Tidak ada penyelesaian cepat yang aktif.');
        job = null;
        sim.cancel();
        ack(seq, command);
        return snapshot(true);
    }
  }

  function receive(message: unknown) {
    let envelope;
    try {
      envelope = parseCommand(message);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      const raw = (typeof message === 'object' && message !== null ? message : {}) as Record<string, unknown>;
      send(Number.isSafeInteger(raw.commandSeq) ? raw.commandSeq as number : null,
        { type: 'ACK', command: null, accepted: false, code: error.code, message: error.message, state: null },
        Number.isSafeInteger(raw.epoch) ? raw.epoch as number : -1, typeof raw.jobId === 'string' ? raw.jobId : '');
      return;
    }
    const { payload: command, commandSeq: seq } = envelope;
    const reject = (code: RejectCode, text: string) => send(seq,
      { type: 'ACK', command: command.type, accepted: false, code, message: text, state: engine && envelope.epoch === epoch ? state() : null },
      envelope.epoch, envelope.jobId);

    if (epoch === null) {
      if (command.type !== 'CREATE_RUN' || command.nextEpoch !== envelope.epoch) {
        reject('NOT_BOUND', 'Worker baru hanya menerima CREATE_RUN pada epoch yang dipilih.');
        return;
      }
      try {
        engine = createSimulation(command.config, 0, command.replayLog ?? []);
      } catch (error) {
        reject('INVALID_INPUT', error instanceof Error ? error.message : 'Konfigurasi tidak valid.');
        return;
      }
      epoch = envelope.epoch;
      runId = command.nextRunId;
      lastSeq = seq;
      ack(seq, command);
      snapshot(true);
      return;
    }
    if (envelope.epoch !== epoch) { reject('STALE_EPOCH', 'Command berasal dari generasi run lama.'); return; }
    if (envelope.jobId !== runId) { reject('STALE_JOB', 'Command menargetkan run lain.'); return; }
    if (seq <= lastSeq) {
      // Never re-execute: replay the stored reply, or reject when it fell out of the window.
      const cached = replies.get(seq);
      if (cached) post(cached);
      else reject('DUPLICATE', 'Command ini sudah diterima sebelumnya.');
      return;
    }
    lastSeq = seq;
    try {
      handle(seq, command);
    } catch (error) {
      const code: RejectCode = error instanceof Rejection ? error.code
        : error instanceof RangeError || error instanceof ValidationError ? 'INVALID_INPUT' : 'INTERNAL';
      const reply = reject(code, error instanceof Error ? error.message : String(error));
      if (command.type !== 'ADVANCE_TO') remember(seq, reply);
    }
  }

  return { receive };
}
