import { VERSIONS } from '../domain/config';
import type { ManualEntry, ScenarioConfig } from '../domain/config';
import type { ComparisonSummary, PairResult } from '../simulation/comparison';
import type { RunState, Snapshot } from '../simulation/engine';

export const PROTOCOL_VERSION = VERSIONS.protocolVersion;
export const AVATAR_LIMIT = 150;

export type PauseReason = 'manual' | 'gesture' | 'hidden';
type Transition = { nextEpoch: number; nextRunId: string };

export type Command =
  | ({ type: 'CREATE_RUN'; config: unknown; replayLog?: ManualEntry[] } & Transition)
  | { type: 'RUN' }
  | { type: 'ADVANCE_TO'; targetSimSec: number }
  | { type: 'PAUSE_RUN'; reason: PauseReason }
  | { type: 'RESUME_RUN'; source: 'manual' | 'gesture' }
  | { type: 'ADD_MANUAL'; count: number }
  | { type: 'FAST_FINISH' }
  | { type: 'CANCEL_FAST' }
  | ({ type: 'RESET_RUN' } & Transition)
  | ({ type: 'REPLAY_RUN' } & Transition)
  | { type: 'START_COMPARISON'; batchId: string; a: unknown; b: unknown }
  | { type: 'SUSPEND_COMPARISON'; batchId: string; reason: 'hidden' }
  | { type: 'RESUME_COMPARISON'; batchId: string }
  | { type: 'CANCEL_COMPARISON'; batchId: string };
export type CommandType = Command['type'];

export type CommandEnvelope<T = Command> = {
  protocolVersion: typeof PROTOCOL_VERSION;
  epoch: number;
  jobId: string;
  commandSeq: number;
  payload: T;
};

export type RejectCode =
  | 'PROTOCOL_MISMATCH' | 'MALFORMED' | 'NOT_BOUND' | 'STALE_EPOCH' | 'STALE_JOB' | 'DUPLICATE'
  | 'INVALID_STATE' | 'INVALID_INPUT' | 'BUSY' | 'LIMIT_REACHED' | 'INTERNAL';

export const QUEUE_BINS = 120;
export type QueuePeaks = { binSec: number; spanSec: number; peaks: number[] };

// View projection: everything the UI and scene need, without the full customer records.
export type Projection = Omit<Snapshot, 'customers' | 'waitingCustomerIds'> & {
  runId: string;
  fastMode: boolean;
  pauseReason: PauseReason | null;
  waitingSample: string[];
  summarizedWaiting: number;
  queuePeaks: QueuePeaks;
};

export type ComparisonStatus = 'running' | 'suspended' | 'completed' | 'cancelled' | 'invalid';
/** Batch progress; replies use the batch id as envelope jobId. Pairs count only once both sides are valid. */
export type ComparisonReport = {
  type: 'COMPARISON';
  batchId: string;
  status: ComparisonStatus;
  completedPairs: number;
  a: ScenarioConfig;
  b: ScenarioConfig;
  pairs: PairResult[];
  summary: ComparisonSummary | null;
  message: string | null;
};

export type Ack =
  | { type: 'ACK'; command: CommandType; accepted: true; state: RunState; entry?: ManualEntry; nextEpoch?: number; nextRunId?: string }
  | { type: 'ACK'; command: CommandType | null; accepted: false; code: RejectCode; message: string; state: RunState | null };
export type Reply =
  | Ack
  | { type: 'ADVANCED'; outcome: 'reached' | 'interrupted' | 'stopped'; state: RunState }
  | { type: 'SNAPSHOT'; projection: Projection }
  | ComparisonReport;

export type ReplyEnvelope<T = Reply> = {
  protocolVersion: typeof PROTOCOL_VERSION;
  epoch: number;
  jobId: string;
  replyTo: number | null;
  snapshotRevision: number;
  payload: T;
};

export class ProtocolError extends Error {
  constructor(readonly code: 'PROTOCOL_MISMATCH' | 'MALFORMED', message: string) { super(message); }
}

const malformed = (message: string): never => { throw new ProtocolError('MALFORMED', message); };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isIndex = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

function transition(payload: Record<string, unknown>): Transition {
  if (!isIndex(payload.nextEpoch, 0) || !isText(payload.nextRunId)) malformed('nextEpoch/nextRunId tidak valid.');
  return { nextEpoch: payload.nextEpoch as number, nextRunId: payload.nextRunId as string };
}

// Runtime check at the main→worker boundary; postMessage clones data but does not validate it.
// Config and replay log contents are validated by the engine when a run is created.
export function parseCommand(input: unknown): CommandEnvelope {
  if (!isRecord(input)) return malformed('Pesan harus berupa objek.');
  if (input.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolError('PROTOCOL_MISMATCH', 'Versi protokol tidak cocok.');
  const { epoch, jobId, commandSeq, payload } = input;
  if (!isIndex(epoch, 0) || !isText(jobId) || !isIndex(commandSeq, 1) || !isRecord(payload)) malformed('Envelope tidak valid.');
  const p = payload as Record<string, unknown>;
  let command: Command;
  switch (p.type) {
    case 'CREATE_RUN':
      if (p.replayLog !== undefined && !Array.isArray(p.replayLog)) malformed('replayLog harus berupa daftar.');
      command = { type: 'CREATE_RUN', config: p.config, ...(p.replayLog ? { replayLog: p.replayLog as ManualEntry[] } : {}), ...transition(p) };
      break;
    case 'RESET_RUN': case 'REPLAY_RUN':
      command = { type: p.type, ...transition(p) };
      break;
    case 'START_COMPARISON':
      if (!isText(p.batchId)) malformed('batchId tidak valid.');
      command = { type: 'START_COMPARISON', batchId: p.batchId as string, a: p.a, b: p.b };
      break;
    case 'SUSPEND_COMPARISON':
      if (!isText(p.batchId) || p.reason !== 'hidden') malformed('batchId/alasan tidak valid.');
      command = { type: 'SUSPEND_COMPARISON', batchId: p.batchId as string, reason: 'hidden' };
      break;
    case 'RESUME_COMPARISON': case 'CANCEL_COMPARISON':
      if (!isText(p.batchId)) malformed('batchId tidak valid.');
      command = { type: p.type, batchId: p.batchId as string };
      break;
    case 'RUN': case 'FAST_FINISH': case 'CANCEL_FAST':
      command = { type: p.type };
      break;
    case 'ADVANCE_TO':
      if (typeof p.targetSimSec !== 'number' || !Number.isFinite(p.targetSimSec)) malformed('targetSimSec harus finite.');
      command = { type: 'ADVANCE_TO', targetSimSec: p.targetSimSec as number };
      break;
    case 'PAUSE_RUN':
      if (p.reason !== 'manual' && p.reason !== 'gesture' && p.reason !== 'hidden') malformed('Alasan pause tidak dikenal.');
      command = { type: 'PAUSE_RUN', reason: p.reason as PauseReason };
      break;
    case 'RESUME_RUN':
      if (p.source !== 'manual' && p.source !== 'gesture') malformed('Sumber resume tidak dikenal.');
      command = { type: 'RESUME_RUN', source: p.source as 'manual' | 'gesture' };
      break;
    case 'ADD_MANUAL':
      // Range 1–20 is enforced by the engine so the rejection carries the canonical state.
      if (typeof p.count !== 'number') malformed('count harus berupa angka.');
      command = { type: 'ADD_MANUAL', count: p.count as number };
      break;
    default:
      return malformed('Jenis command tidak dikenal.');
  }
  return { protocolVersion: PROTOCOL_VERSION, epoch: epoch as number, jobId: jobId as string, commandSeq: commandSeq as number, payload: command };
}

export function project(snapshot: Snapshot, runId: string, fastMode: boolean, pauseReason: PauseReason | null): Projection {
  const { customers, waitingCustomerIds, ...rest } = snapshot;
  const busy = snapshot.servers.filter(server => server.busyCustomerId !== null).length;
  const waitingSample = waitingCustomerIds.slice(0, Math.max(0, AVATAR_LIMIT - busy));
  return {
    ...rest, runId, fastMode, pauseReason, waitingSample, summarizedWaiting: waitingCustomerIds.length - waitingSample.length,
    queuePeaks: queuePeaks(customers, snapshot.configSnapshot.horizonSec, snapshot.simTimeSec),
  };
}

/**
 * Exact peak queue length per bin, rebuilt from customer records. Arrivals and service starts at the
 * same timestamp are netted first, so levels match the engine's post-dispatch queue (and maxQueue).
 */
export function queuePeaks(customers: Snapshot['customers'], horizonSec: number, simTimeSec: number): QueuePeaks {
  const spanSec = Math.max(horizonSec, simTimeSec);
  const binSec = spanSec / QUEUE_BINS;
  const delta = new Map<number, number>();
  for (const customer of customers) {
    delta.set(customer.arrivalAt, (delta.get(customer.arrivalAt) ?? 0) + 1);
    if (customer.serviceStartAt !== null) delta.set(customer.serviceStartAt, (delta.get(customer.serviceStartAt) ?? 0) - 1);
  }
  const times = [...delta.keys()].sort((a, b) => a - b);
  const filled = Math.min(QUEUE_BINS, Math.floor(simTimeSec / binSec) + 1);
  const peaks: number[] = [];
  let level = 0, next = 0;
  for (let bin = 0; bin < filled; bin++) {
    const end = bin === QUEUE_BINS - 1 ? Infinity : (bin + 1) * binSec;
    // A change exactly at the bin start holds for the whole bin; apply it before reading the carried level.
    while (next < times.length && times[next] <= bin * binSec) level += delta.get(times[next++])!;
    let peak = level;
    while (next < times.length && times[next] < end) {
      level += delta.get(times[next++])!;
      peak = Math.max(peak, level);
    }
    peaks.push(peak);
  }
  return { binSec, spanSec, peaks };
}
