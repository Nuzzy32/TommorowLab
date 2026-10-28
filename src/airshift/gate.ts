// AirShift pose gate (PRD §9.2, DESIGN_SYSTEM CMP-16). Real time in milliseconds, never simulation time.
export const GATE = { minScore: 0.85, dwellMs: 600, staleMs: 200, rearmMs: 300, cooldownMs: 1500, lostLabelMs: 500 } as const;

export type Pose = 'Open_Palm' | 'Thumb_Up';
/** One recognizer result: capture time, hand count, top gesture category and its score. */
export type Sample = { at: number; hands: number; gesture: string; score: number };
export type GateStatus = 'ready' | 'no-hand' | 'low-confidence' | 'multiple-hands' | 'holding' | 're-arm';
export type GateState = {
  candidate: Pose | null; since: number; armed: boolean; neutralSince: number | null; lastActionAt: number; lastHandAt: number;
};
export type GateOutput = { state: GateState; status: GateStatus; pose: Pose | null; progress: number; action: 'pause' | 'resume' | null };

export const initialGate = (): GateState => ({ candidate: null, since: 0, armed: true, neutralSince: null, lastActionAt: -Infinity, lastHandAt: -Infinity });
const POSES: Record<string, Pose> = { Open_Palm: 'Open_Palm', Thumb_Up: 'Thumb_Up' };
const ACTION: Record<Pose, 'pause' | 'resume'> = { Open_Palm: 'pause', Thumb_Up: 'resume' };

/**
 * Advances the gate by one sample. A pose acts at most once: it must stay above the score for the full dwell
 * with no gap, and the next action needs ≥300 ms neutral/no hand plus a 1.5 s cooldown since the last one.
 */
export function stepGate(state: GateState, sample: Sample, now: number): GateOutput {
  const out = (next: GateState, status: GateStatus, pose: Pose | null = null, progress = 0, action: GateOutput['action'] = null): GateOutput =>
    ({ state: next, status, pose, progress, action });
  // Re-arm once the hand has been neutral or absent long enough after an action.
  const rearm = (next: GateState, at: number): GateState => {
    const neutralSince = next.neutralSince ?? at;
    return { ...next, candidate: null, neutralSince, armed: next.armed || at - neutralSince >= GATE.rearmMs };
  };

  if (now - sample.at > GATE.staleMs) return out({ ...state, candidate: null }, state.candidate ? 'low-confidence' : 'ready');
  if (sample.hands > 1) return out({ ...state, candidate: null, lastHandAt: sample.at }, 'multiple-hands');
  if (sample.hands === 0) {
    const next = rearm(state, sample.at);
    return out(next, sample.at - state.lastHandAt > GATE.lostLabelMs ? 'no-hand' : next.armed ? 'ready' : 're-arm');
  }
  const seen = { ...state, lastHandAt: sample.at };
  const pose = POSES[sample.gesture] ?? null;
  if (!pose) {
    const next = rearm(seen, sample.at);
    return out(next, next.armed ? 'ready' : 're-arm');
  }
  if (sample.score < GATE.minScore) return out({ ...seen, candidate: null }, 'low-confidence', pose);
  // A held pose after an action never repeats; it has to go neutral first.
  if (!seen.armed) return out({ ...seen, candidate: null, neutralSince: null }, 're-arm', pose);
  const since = seen.candidate === pose ? seen.since : sample.at;
  const held = sample.at - since;
  const progress = Math.min(1, held / GATE.dwellMs);
  if (held >= GATE.dwellMs && sample.at - seen.lastActionAt >= GATE.cooldownMs) {
    return out({ ...seen, candidate: null, armed: false, neutralSince: null, lastActionAt: sample.at }, 'ready', pose, 1, ACTION[pose]);
  }
  return out({ ...seen, candidate: pose, since, neutralSince: null }, 'holding', pose, progress);
}

/** Why a recognised gesture may not act right now; null means the intent can go to the controller. */
export function gestureBlocked({ action, status, pauseReason, fast, dialogOpen, batchActive, typing, hidden }: {
  action: 'pause' | 'resume'; status: string; pauseReason: string | null; fast: boolean; dialogOpen: boolean;
  batchActive: boolean; typing: boolean; hidden: boolean;
}): string | null {
  if (hidden) return 'Tab tidak aktif.';
  if (dialogOpen) return 'Tutup dialog terlebih dahulu.';
  if (batchActive) return 'Perbandingan A/B sedang berjalan.';
  if (typing) return 'Fokus sedang di kolom isian.';
  if (fast) return 'Penyelesaian cepat sedang berjalan.';
  if (action === 'pause') return status === 'RUNNING' ? null : 'Telapak terbuka hanya menjeda run yang sedang berjalan.';
  if (status !== 'PAUSED') return 'Jempol ke atas hanya melanjutkan run yang dijeda.';
  return pauseReason === 'manual' || pauseReason === 'gesture' ? null : 'Jeda karena tab tidak aktif hanya dapat dilanjutkan dengan tombol.';
}
