import type * as THREE from 'three';
import type { Chair, XZ } from './pure';

// Crowd behaviour rules shared by customers (agents.ts) and the cleaner (crew.ts). Visual only.

// Queue spacing: a walker stops while someone is this close in front of them.
export const GAP = 0.6;
// Customers arriving within this many sim seconds of a group's first member may join it, up to GROUP_MAX people.
export const GROUP_WINDOW = 8, GROUP_MAX = 3, GROUP_CHANCE = 0.55;
// Share of diners who leave their tray behind, and how many trays can wait on tables at once.
export const LEAVE_TRAY = 0.2, MAX_LEFTOVERS = 6;
// Tray-return rack in the dining area, reached along the aisle at z = -0.75.
export const RACK: XZ = [13.1, -0.75], CORRIDOR_X = 10.8;

// True when another walker stands within GAP ahead of p along the walking direction (dx, dz).
export function blocked(p: { x: number; z: number }, dx: number, dz: number, others: { x: number; z: number }[]) {
  const len = Math.hypot(dx, dz);
  if (!len) return false;
  return others.some(o => {
    const ox = o.x - p.x, oz = o.z - p.z, d = Math.hypot(ox, oz);
    return d > 1e-6 && d < GAP && (ox * dx + oz * dz) / (d * len) > 0.7;
  });
}

// Sideways nudge for a walker passing someone within `r`: away from them, square to the walking direction (dx, dz),
// at most `max` per call, so passing bends around people and the walker drifts back onto the lane after.
export function sidestep(p: { x: number; z: number }, dx: number, dz: number, others: { x: number; z: number }[], r = 0.42, max = 0.04): [number, number] {
  const len = Math.hypot(dx, dz);
  if (!len) return [0, 0];
  const px = -dz / len, pz = dx / len;
  let push = 0;
  others.forEach(o => {
    const ox = o.x - p.x, oz = o.z - p.z, d = Math.hypot(ox, oz);
    if (d < 1e-6 || d >= r) return;
    const side = ox * px + oz * pz;
    push += (side > 0 ? -1 : 1) * (r - d);
  });
  push = Math.max(-max, Math.min(max, push));
  return push ? [px * push, pz * push] : [0, 0];
}

// The dining table a chair belongs to (tables sit at x 9.3 and 12.3, chairs half a metre either side).
export const tableOf = (c: Chair) => `${Math.round(c.x / 3)}:${c.tz}`;
// A free chair, preferring tables where group mates already sit.
export function pickChair(chairs: Chair[], mates: Chair[], rnd = Math.random) {
  const free = chairs.filter(c => !c.busy);
  const near = new Set(mates.map(tableOf));
  const pool = free.some(c => near.has(tableOf(c))) ? free.filter(c => near.has(tableOf(c))) : free;
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

export type Group = { id: number; first: number; size: number };
// Joins an open group that started within GROUP_WINDOW, or starts a new one; `groups` is kept newest last.
export function joinGroup(groups: Group[], arrivedAt: number | undefined, rnd = Math.random) {
  if (arrivedAt == null) return null;
  let open: Group | undefined;
  for (const g of groups) if (arrivedAt - g.first <= GROUP_WINDOW && arrivedAt >= g.first && g.size < GROUP_MAX) open = g;
  if (open && rnd() < GROUP_CHANCE) { open.size++; return open.id; }
  const g = { id: (groups.at(-1)?.id ?? 0) + 1, first: arrivedAt, size: 1 };
  groups.push(g);
  if (groups.length > 20) groups.shift();
  return g.id;
}

export type Leftover = { tray: THREE.Object3D; x: number; aisle: number; face: number; claimed?: boolean };
// Keeps at most `max` unclaimed trays on tables; returns the oldest ones that had to go.
export function trimLeftovers(list: Leftover[], max = MAX_LEFTOVERS) {
  const gone: Leftover[] = [];
  while (list.filter(l => !l.claimed).length > max) {
    const i = list.findIndex(l => !l.claimed);
    gone.push(...list.splice(i, 1));
  }
  return gone;
}
// The cleaner's detour, all along the corridor and aisles: to the table side, back, then to the rack and back.
export const detour = (l: Leftover): XZ[] => [[CORRIDOR_X, l.aisle], [l.x, l.aisle], [CORRIDOR_X, l.aisle], [CORRIDOR_X, RACK[1]], RACK, [CORRIDOR_X, RACK[1]]];
