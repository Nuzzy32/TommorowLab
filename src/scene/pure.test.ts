import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  AISLE, BODY, D2, H2, LAME_DELAY, SCENE_AVATAR_LIMIT, SLOT, SLOW_IN_WINDOW, TABLES, WALL_SEGS,
  collide, counterXs, declutter, diningChairs, glance, loopWindow, pose, slowWatch, stepTo, texting, wanted,
} from './pure';
import type { Fig } from './pure';

const fig = (phone = false): Fig => {
  const g = new THREE.Group(), j = () => new THREE.Group();
  return { g, head: new THREE.Mesh(), hips: [j(), j()], knees: [j(), j()], arms: [j(), j()], elbows: [j(), j()], shirt: [], phone: phone ? new THREE.Mesh() : undefined };
};

describe('wall collision', () => {
  it('pushes a point standing inside the front wall back into the room', () => {
    const p = collide({ x: 0, z: D2 - 0.05 });
    expect(p.z).toBeCloseTo(D2 - 0.12 - BODY, 6);
    expect(p.x).toBe(0);
  });
  it('lets the entrance, the exit and the dining half-wall gap through', () => {
    expect(collide({ x: -4.5, z: D2 })).toEqual({ x: -4.5, z: D2 });
    expect(collide({ x: 10.2, z: D2 })).toEqual({ x: 10.2, z: D2 });
    expect(collide({ x: 7.4, z: 1.0 })).toEqual({ x: 7.4, z: 1.0 });
  });
  it('keeps the walker near the building', () => {
    expect(collide({ x: 100, z: 100 })).toEqual({ x: H2 + 3, z: D2 + 4 });
    expect(collide({ x: -100, z: -100 })).toEqual({ x: -H2 - 3, z: -D2 - 3 });
  });
  it('leaves a point exactly on a wall line alone instead of dividing by zero', () => {
    const [x1, z1, x2, z2] = WALL_SEGS[0];
    expect(collide({ x: (x1 + x2) / 2, z: (z1 + z2) / 2 })).toEqual({ x: (x1 + x2) / 2, z: (z1 + z2) / 2 });
  });
  it('stops at the kitchen wall from either side', () => {
    expect(collide({ x: -7.1, z: -8.0 }).x).toBeCloseTo(-7.2 + 0.12 + BODY, 6);
    expect(collide({ x: -7.3, z: -8.0 }).x).toBeCloseTo(-7.2 - 0.12 - BODY, 6);
  });
});

describe('MP3 loop window', () => {
  it('skips the LAME encoder delay when the decoder kept the padding (WebKit)', () => {
    expect(loopWindow(34.0376, 34.0067)).toEqual([LAME_DELAY, LAME_DELAY + 34.0067]);
  });
  it('loops from zero when the decoder already stripped it (Chromium)', () => {
    expect(loopWindow(80, 80)).toEqual([0, 80]);
    expect(loopWindow(80.02, 80)[0]).toBe(0);
  });
  it('always spans exactly the audible length', () => {
    for (const d of [66, 66.0376, 66.5]) { const [a, b] = loopWindow(d, 66); expect(b - a).toBeCloseTo(66, 9); }
  });
});

describe('gait, pose and glances', () => {
  it('sits with thighs forward and shins down', () => {
    const f = fig();
    pose(f, 1.2, 0, true);
    expect(f.hips.map(h => h.rotation.x)).toEqual([-1.5, -1.5]);
    expect(f.knees.map(k => k.rotation.x)).toEqual([1.5, 1.5]);
  });
  it('swings legs opposite each other and bends the trailing knee', () => {
    const f = fig();
    pose(f, Math.PI / 2);
    expect(f.hips[0].rotation.x).toBeCloseTo(0.5);
    expect(f.hips[1].rotation.x).toBeCloseTo(-0.5);
    expect(f.knees[0].rotation.x).toBeCloseTo(0);
    expect(f.knees[1].rotation.x).toBeCloseTo(0.6);
    expect(f.arms[0].rotation.x).toBeCloseTo(-0.45);
  });
  it('stands neutral without a gait phase and lets reach override the arm swing', () => {
    const f = fig();
    pose(f, null);
    expect([...f.hips, ...f.knees].every(j => j.rotation.x === 0)).toBe(true);
    pose(f, Math.PI / 2, 1.25);
    expect(f.arms.map(a => a.rotation.x)).toEqual([-1.25, -1.25]);
    expect(f.elbows.map(e => e.rotation.x)).toEqual([-0.35, -0.35]);
  });
  it('raises the phone arm and tips the head only while texting', () => {
    const f = fig(true);
    texting(f, true);
    expect(f.phone!.visible).toBe(true);
    expect(f.head.rotation.x).toBeCloseTo(0.38);
    expect(f.elbows[1].rotation.x).toBeCloseTo(-1.45);
    texting(f, false);
    expect(f.phone!.visible).toBe(false);
    expect(f.head.rotation.x).toBe(0);
  });
  it('keeps glances within a natural head turn', () => {
    for (let t = 0; t < 200000; t += 997) for (const ph of [0, 1.3, 5.9]) expect(Math.abs(glance(t, ph))).toBeLessThanOrEqual(0.61);
  });
});

describe('stepping toward a waypoint', () => {
  it('snaps onto the target when it is within one step', () => {
    const g = new THREE.Group();
    expect(stepTo(g, new THREE.Vector3(0.1, 0, 0), 0.5, 0.016)).toBe(true);
    expect(g.position.x).toBe(0.1);
  });
  it('otherwise moves exactly one step and turns the short way round', () => {
    const g = new THREE.Group();
    g.rotation.y = 3;
    expect(stepTo(g, new THREE.Vector3(0, 0, -10), 0.5, 1)).toBe(false);
    expect(g.position.distanceTo(new THREE.Vector3())).toBeCloseTo(0.5);
    expect(g.rotation.y).toBeCloseTo(Math.PI, 6);
  });
});

describe('counter and queue layout', () => {
  it('centres the counters and narrows them when there are many', () => {
    expect(counterXs(1)).toEqual([[0], 1.8]);
    const [xs, w] = counterXs(6);
    expect(xs[0]).toBeCloseTo(-xs[5]);
    expect(xs[1] - xs[0]).toBeCloseTo(13 / 6);
    expect(w).toBeCloseTo(13 / 6 - 0.45);
  });
  it('lays the queue as one serpentine lane inside the queue zone', () => {
    for (let k = 0; k < SCENE_AVATAR_LIMIT; k++) {
      const [x, z] = SLOT(k);
      expect(x).toBeGreaterThanOrEqual(-6);
      expect(x).toBeLessThanOrEqual(6);
      expect(z).toBeGreaterThanOrEqual(-3);
      expect(z).toBeLessThanOrEqual(4.3);
      if (k) { const [px, pz] = SLOT(k - 1); expect(Math.hypot(x - px, z - pz)).toBeCloseTo(1.3); }
    }
  });
  it('gives every dining table four chairs that face it and open onto an aisle', () => {
    const chairs = diningChairs();
    expect(chairs).toHaveLength(TABLES.length * 4);
    chairs.forEach(c => {
      expect(AISLE).toContain(c.aisle);
      expect(Math.sign(c.z - c.tz)).toBe(c.s);
      expect(c.busy).toBe(false);
    });
  });
});

describe('slow-frame watch', () => {
  it('trips only once most of the recent frames were slow', () => {
    const slow = slowWatch();
    for (let i = 0; i < SLOW_IN_WINDOW - 1; i++) expect(slow(200)).toBe(false);
    expect(slow(200)).toBe(true);
  });
  it('forgets slow frames that scrolled out of the window', () => {
    const slow = slowWatch();
    for (let i = 0; i < SLOW_IN_WINDOW - 1; i++) slow(200);
    for (let i = 0; i < 15; i++) expect(slow(16)).toBe(false);
    expect(slow(200)).toBe(false);
  });
});

describe('label declutter', () => {
  it('lifts a label that overlaps its left neighbour and leaves separate ones alone', () => {
    const boxes = declutter([{ x: 40, y: 100, w: 60, h: 22 }, { x: 0, y: 100, w: 60, h: 22 }, { x: 300, y: 100, w: 60, h: 22 }]);
    expect(boxes.map(b => b.x)).toEqual([0, 40, 300]);
    expect(boxes[1].y).toBe(100 - 22 - 6);
    expect(boxes[0].y).toBe(100);
    expect(boxes[2].y).toBe(100);
  });
});

describe('which customers the scene shows', () => {
  const c = (id: string) => ({ id, manual: false });
  it('caps waiting customers at the avatar limit by lane slot', () => {
    const want = wanted(Array.from({ length: SCENE_AVATAR_LIMIT + 5 }, (_, i) => c(`w${i}`)), []);
    expect(want.size).toBe(SCENE_AVATAR_LIMIT);
    expect(want.get('w3')).toEqual({ u: c('w3'), k: 3, st: 'w' });
  });
  it('lets service win over waiting and skips idle counters', () => {
    const want = wanted([c('a'), c('b')], [null, c('b')]);
    expect(want.get('b')).toEqual({ u: c('b'), i: 1, st: 's' });
    expect(want.size).toBe(2);
  });
});
