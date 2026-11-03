import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CORRIDOR_X, GAP, GROUP_MAX, GROUP_WINDOW, MAX_LEFTOVERS, RACK, blocked, detour, joinGroup, pickChair, sidestep, tableOf, trimLeftovers } from './crowd';
import type { Group, Leftover } from './crowd';
import { AISLE, diningChairs } from './pure';

describe('queue spacing', () => {
  const p = { x: 0, z: 0 };
  it('holds a walker behind someone close in front', () => {
    expect(blocked(p, 1, 0, [{ x: GAP - 0.1, z: 0.1 }])).toBe(true);
  });
  it('ignores people behind, beside, far away, or the walker itself', () => {
    expect(blocked(p, 1, 0, [{ x: -0.3, z: 0 }])).toBe(false);
    expect(blocked(p, 1, 0, [{ x: 0.1, z: 0.45 }])).toBe(false);
    expect(blocked(p, 1, 0, [{ x: GAP + 0.1, z: 0 }])).toBe(false);
    expect(blocked(p, 1, 0, [p])).toBe(false);
    expect(blocked(p, 0, 0, [{ x: 0.2, z: 0 }])).toBe(false);
  });
  it('never lets two walkers hold each other up', () => {
    const a = { x: 0, z: 0 }, b = { x: 0.3, z: 0.05 };
    expect(blocked(a, 1, 0, [b]) && blocked(b, 1, 0, [a])).toBe(false);
  });
});

describe('passing in the lane', () => {
  it('steps square to the walking direction, away from the person being passed', () => {
    const [ox, oz] = sidestep({ x: 0, z: 0 }, 1, 0, [{ x: 0.1, z: 0.1 }]);
    expect(ox).toBeCloseTo(0);
    expect(oz).toBeLessThan(0);
    expect(Math.abs(oz)).toBeLessThanOrEqual(0.04);
  });
  it('does nothing when nobody is close or the walker is standing', () => {
    expect(sidestep({ x: 0, z: 0 }, 1, 0, [{ x: 0.5, z: 0 }])).toEqual([0, 0]);
    expect(sidestep({ x: 0, z: 0 }, 0, 0, [{ x: 0.1, z: 0 }])).toEqual([0, 0]);
  });
});

describe('groups and seating', () => {
  it('lets close arrivals join, up to the group size, and starts new groups after the window', () => {
    const groups: Group[] = [], yes = () => 0;
    const first = joinGroup(groups, 100, yes);
    for (let i = 1; i < GROUP_MAX; i++) expect(joinGroup(groups, 100 + i, yes)).toBe(first);
    expect(joinGroup(groups, 103, yes)).not.toBe(first);
    expect(joinGroup(groups, 100 + GROUP_WINDOW + 30, yes)).not.toBe(first);
    expect(joinGroup(groups, undefined)).toBeNull();
  });
  it('sometimes arrives alone even when a group is open', () => {
    const groups: Group[] = [];
    const first = joinGroup(groups, 10, () => 0);
    expect(joinGroup(groups, 11, () => 0.99)).not.toBe(first);
  });
  it('seats friends at the table where a mate already sits, else anywhere free', () => {
    const chairs = diningChairs(), mate = chairs[5];
    mate.busy = true;
    for (let i = 0; i < 20; i++) expect(tableOf(pickChair(chairs, [mate])!)).toBe(tableOf(mate));
    chairs.filter(c => tableOf(c) === tableOf(mate)).forEach(c => { c.busy = true; });
    const other = pickChair(chairs, [mate])!;
    expect(other.busy).toBe(false);
    expect(tableOf(other)).not.toBe(tableOf(mate));
    chairs.forEach(c => { c.busy = true; });
    expect(pickChair(chairs, [])).toBeNull();
  });
  it('groups the four chairs of each table together', () => {
    const counts = new Map<string, number>();
    diningChairs().forEach(c => counts.set(tableOf(c), (counts.get(tableOf(c)) ?? 0) + 1));
    expect([...counts.values()]).toEqual(Array(8).fill(4));
  });
});

describe('left trays and the cleaner', () => {
  const tray = (): Leftover => ({ tray: new THREE.Group(), x: 9.8, aisle: AISLE[1], face: 0 });
  it('drops the oldest unclaimed trays beyond the cap, never one the cleaner is carrying', () => {
    const list = Array.from({ length: MAX_LEFTOVERS + 2 }, tray);
    list[0].claimed = true;
    const oldest = list[1], next = list[2];
    const gone = trimLeftovers(list);
    expect(gone).toHaveLength(1);
    expect(gone[0]).toBe(oldest);
    expect(list).toHaveLength(MAX_LEFTOVERS + 1);
    expect(list[0].claimed).toBe(true);
    expect(list[1]).toBe(next);
  });
  it('walks only along the corridor and aisles, ending back on the corridor', () => {
    const l = tray(), path = detour(l);
    expect(path[1]).toEqual([l.x, l.aisle]);
    expect(path).toContainEqual(RACK);
    path.forEach(([x, z], i) => {
      if (!i) return;
      const [px, pz] = path[i - 1];
      expect(x === px || z === pz).toBe(true);
    });
    expect(path.at(-1)![0]).toBe(CORRIDOR_X);
  });
});
