import { describe, expect, it } from 'vitest';
import { GATE, gestureBlocked, initialGate, stepGate } from './gate';
import type { GateOutput, Sample } from './gate';

// Feeds samples captured every `every` ms and evaluated immediately (fresh), returning every output.
function feed(samples: Omit<Sample, 'at'>[], every = 100, start = 1000) {
  let state = initialGate();
  return samples.map((sample, index): GateOutput => {
    const at = start + index * every;
    const output = stepGate(state, { ...sample, at }, at);
    state = output.state;
    return output;
  });
}
const palm = { hands: 1, gesture: 'Open_Palm', score: 0.95 };
const thumb = { hands: 1, gesture: 'Thumb_Up', score: 0.95 };
const none = { hands: 1, gesture: 'None', score: 0.9 };
const empty = { hands: 0, gesture: 'None', score: 0 };
const actions = (outputs: GateOutput[]) => outputs.map(output => output.action).filter(Boolean);

describe('AirShift pose gate (PRD §9.2)', () => {
  it('acts once after a stable 600 ms pose and shows dwell progress before that', () => {
    const outputs = feed(Array(10).fill(palm));
    expect(outputs.slice(0, 6).map(output => output.status)).toEqual(['holding', 'holding', 'holding', 'holding', 'holding', 'holding']);
    expect(outputs[3].progress).toBeCloseTo(0.5, 10);
    expect(outputs[6].action).toBe('pause');
    // Holding the pose never repeats the action.
    expect(actions(outputs)).toEqual(['pause']);
    expect(outputs.slice(7).every(output => output.status === 're-arm')).toBe(true);
  });

  it('a short gap or a low score breaks the dwell instead of being merged into 600 ms', () => {
    expect(actions(feed([palm, palm, palm, none, palm, palm, palm]))).toEqual([]);
    expect(actions(feed([palm, palm, palm, { ...palm, score: 0.84 }, palm, palm, palm]))).toEqual([]);
    expect(feed([{ ...palm, score: 0.84 }])[0]).toMatchObject({ status: 'low-confidence', action: null });
    expect(actions(feed([palm, palm, palm, thumb, thumb, thumb]))).toEqual([]);
  });

  it('needs ≥300 ms neutral and a 1.5 s cooldown before the next action', () => {
    // Pause at 1600; 200 ms neutral is not enough to re-arm.
    expect(actions(feed([...Array(7).fill(palm), none, none, ...Array(7).fill(thumb)]))).toEqual(['pause']);
    // 400 ms without a hand re-arms; thumb then acts once the cooldown has passed.
    const outputs = feed([...Array(7).fill(palm), ...Array(4).fill(empty), ...Array(12).fill(thumb)]);
    expect(actions(outputs)).toEqual(['pause', 'resume']);
    const resumeAt = outputs.findIndex(output => output.action === 'resume');
    expect(1000 + resumeAt * 100 - 1600).toBeGreaterThanOrEqual(GATE.cooldownMs);
  });

  it('ignores stale results (>200 ms) and every pose while two hands are visible', () => {
    let state = initialGate();
    for (let at = 0; at <= 1000; at += 100) {
      const output = stepGate(state, { ...palm, at }, at + 250);
      expect(output.action).toBeNull();
      state = output.state;
    }
    expect(actions(feed(Array(10).fill({ ...palm, hands: 2 })))).toEqual([]);
    expect(feed([{ ...palm, hands: 2 }])[0].status).toBe('multiple-hands');
  });

  it('says "no hand" only after the hand has been missing for more than 500 ms', () => {
    const outputs = feed([palm, empty, empty, empty, empty, empty, empty, empty]);
    expect(outputs[1].status).toBe('ready');
    expect(outputs.at(-1)!.status).toBe('no-hand');
  });

  it('gesture intents respect the run state, modals, batch, typing and hidden pauses', () => {
    const base = { status: 'RUNNING', pauseReason: null, fast: false, dialogOpen: false, batchActive: false, typing: false, hidden: false };
    expect(gestureBlocked({ ...base, action: 'pause' })).toBeNull();
    expect(gestureBlocked({ ...base, action: 'pause', fast: true })).toMatch('cepat');
    expect(gestureBlocked({ ...base, action: 'pause', status: 'READY' })).toMatch('menjeda');
    expect(gestureBlocked({ ...base, action: 'resume', status: 'PAUSED', pauseReason: 'manual' })).toBeNull();
    expect(gestureBlocked({ ...base, action: 'resume', status: 'PAUSED', pauseReason: 'gesture' })).toBeNull();
    expect(gestureBlocked({ ...base, action: 'resume', status: 'PAUSED', pauseReason: 'hidden' })).toMatch('tombol');
    expect(gestureBlocked({ ...base, action: 'resume', status: 'READY' })).toMatch('melanjutkan');
    expect(gestureBlocked({ ...base, action: 'pause', dialogOpen: true })).toMatch('dialog');
    expect(gestureBlocked({ ...base, action: 'pause', batchActive: true })).toMatch('A/B');
    expect(gestureBlocked({ ...base, action: 'pause', typing: true })).toMatch('isian');
  });
});
