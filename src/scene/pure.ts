import * as THREE from 'three';

// Layout constants and the scene's DOM-free maths, shared by every scene module and unit-tested in pure.test.ts.

export const SCENE_AVATAR_LIMIT = 40;

export type XZ = [number, number];
/** `arrivedAt` is the arrival time in sim seconds, when known (waiting customers). */
export type SceneCustomer = { id: string; manual: boolean; arrivedAt?: number };
export type Node = { v: THREE.Vector3; face?: number; wait?: number; fn?: () => void };
export type Chair = { x: number; z: number; tz: number; s: number; aisle: number; busy: boolean };
// Low-poly person: hips/knees/arms are pivots so legs swing and bend to sit; `shirt` meshes carry the status colour.
export type Fig = { g: THREE.Group; head: THREE.Mesh; hips: THREE.Group[]; knees: THREE.Group[]; arms: THREE.Group[]; elbows: THREE.Group[]; shirt: THREE.Mesh[]; phone?: THREE.Mesh };

export const FW = 28, FD = 18, FY = 0.12, H2 = FW / 2, D2 = FD / 2;
// The cutaway walls stop at 1.5 so the top view sees in; in walk mode they carry on up to the ceiling.
// About 4 m at the people's scale: a canteen hall this size with a 3 m ceiling felt like it sat on your head.
export const CEIL = FY + 3.0;
export const HIP = FY + 0.52, HEAD = FY + 1.11, SEAT_DROP = -0.16;
export const LABEL_FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
export const ENTRY: XZ = [-4.55, 4.45];
export const AISLE = [-3.65, -0.75, 2.55, 5.6, 8.45];

export const SLOT = (k: number): XZ => { const r = Math.floor(k / 8), col = k % 8, cc = r % 2 ? col : 7 - col; return [-4.55 + cc * 1.3, -2.2 + r * 1.3]; };
export const counterXs = (c: number): [number[], number] => {
  const sp = Math.min(2.4, 13 / c), o: number[] = [];
  for (let i = 0; i < c; i++) o.push((i - (c - 1) / 2) * sp);
  return [o, Math.min(1.8, sp - 0.45)];
};
export const N = (p: XZ, o: Omit<Node, 'v'> = {}): Node => ({ v: new THREE.Vector3(p[0], 0, p[1]), ...o });
export const pick = <X,>(xs: X[]) => xs[Math.floor(Math.random() * xs.length)];

// Walls as [x1, z1, x2, z2, height = 1.5, thickness = 0.24]; the room builds them, walk mode collides with them.
export const WALLS: [number, number, number, number, number?, number?][] = [
  [-H2, -D2, H2, -D2], [-H2, -D2, -H2, D2], [H2, -D2, H2, D2],
  [-H2, D2, -6.6, D2], [-2.4, D2, 9.2, D2], [11.2, D2, H2, D2],
  [-7.2, -D2, -7.2, -5.9], [7.2, -D2, 7.2, -5.9],
  [-H2, -5.2, -10.6, -5.2], [-8.8, -5.2, -7.2, -5.2],
  [7.2, -5.2, 10.4, -5.2],
  [-H2, 3.6, -11.6, 3.6], [-10.2, 3.6, -10.2, 6.6], [-10.2, 8.2, -10.2, D2],
  [-10.2, -5.2, -10.2, -2.4, 1.5],
  [7.4, -3.2, 7.4, -0.6, 0.9, 0.18], [7.4, 2.6, 7.4, 6.2, 0.9, 0.18],
  [-10.2, -2.4, -10.2, 0.4, 0.9, 0.18], [-10.2, 1.8, -10.2, 3.6, 0.9, 0.18],
];
export const WALL_SEGS = WALLS.map(([x1, z1, x2, z2, , t = 0.24]) => [x1, z1, x2, z2, t / 2]);
export const BODY = 0.28;
// Push p out of every wall it overlaps (furniture and people are walked through), then keep it near the building.
export function collide(p: { x: number; z: number }, walls = WALL_SEGS, body = BODY) {
  for (const [x1, z1, x2, z2, half] of walls) {
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.z - z1) * dz) / (dx * dx + dz * dz)));
    const ex = p.x - (x1 + dx * t), ez = p.z - (z1 + dz * t), d = Math.hypot(ex, ez), min = body + half;
    if (d < min && d > 1e-6) { p.x += ex / d * (min - d); p.z += ez / d * (min - d); }
  }
  p.x = Math.max(-H2 - 3, Math.min(H2 + 3, p.x));
  p.z = Math.max(-D2 - 3, Math.min(D2 + 4, p.z));
  return p;
}

export const TABLES: XZ[] = [9.3, 12.3].flatMap(tx => [-2.4, 0.9, 4.2, 7.0].map((tz): XZ => [tx, tz]));
// Four chairs per dining table; `s` is the side (-1 north, +1 south), `aisle` the walkway a diner uses to reach it.
export const diningChairs = (): Chair[] => TABLES.flatMap(([tx, tz], n) => {
  const r = n % 4;
  return [-0.5, 0.5].flatMap(o => [-1, 1].map(s => ({ x: tx + o, z: tz + s * 0.76, tz, s, aisle: s < 0 ? AISLE[r] : AISLE[r + 1], busy: false })));
});

// LAME files start with 576 samples of encoder delay. Chromium strips it (and the end padding) from the LAME header;
// WebKit keeps both, which would click once per loop, so loop exactly the audible window wherever the decoder put it.
export const LAME_DELAY = 576 / 44100;
export const loopWindow = (duration: number, secs: number): [number, number] => {
  const start = duration - secs > 0.02 ? LAME_DELAY : 0;
  return [start, start + secs];
};

// Mostly below ~8 fps over the last frames: the 3D view would make every control sluggish (NFR-03 light mode).
export const SLOW_FRAME_MS = 120, SLOW_WINDOW = 15, SLOW_IN_WINDOW = 12;
export function slowWatch() {
  const gaps: boolean[] = [];
  return (gap: number) => {
    gaps.push(gap > SLOW_FRAME_MS);
    if (gaps.length > SLOW_WINDOW) gaps.shift();
    return gaps.filter(Boolean).length >= SLOW_IN_WINDOW;
  };
}

// Screen boxes for floating labels: sorted by x, a label that overlaps its left neighbour is lifted above it.
export function declutter<B extends { x: number; y: number; w: number; h: number }>(boxes: B[]) {
  boxes.sort((a, b) => a.x - b.x);
  for (let it = 0; it < 4; it++) for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    if (b.x < a.x + a.w + 4 && Math.abs(b.y - a.y) < a.h + 4) b.y = a.y - b.h - 6;
  }
  return boxes;
}

export type Want = { u: SceneCustomer; k: number; st: 'w' } | { u: SceneCustomer; i: number; st: 's' };
// Who the scene should show: the first SCENE_AVATAR_LIMIT waiting customers by lane slot, and everyone in service.
export function wanted(waiting: SceneCustomer[], serving: (SceneCustomer | null)[]) {
  const want = new Map<string, Want>();
  waiting.slice(0, SCENE_AVATAR_LIMIT).forEach((u, k) => want.set(u.id, { u, k, st: 'w' }));
  serving.forEach((u, i) => { if (u) want.set(u.id, { u, i, st: 's' }); });
  return want;
}

const step = new THREE.Vector3();
// Moves g toward v by up to `dist`, turning to face the way; true once it arrives.
export function stepTo(g: THREE.Object3D, v: THREE.Vector3, dist: number, dt: number) {
  step.subVectors(v, g.position);
  step.y = 0;
  if (step.length() <= dist) { g.position.x = v.x; g.position.z = v.z; return true; }
  g.position.addScaledVector(step.normalize(), dist);
  let d = Math.atan2(step.x, step.z) - g.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * 12);
  return false;
}
// People standing still look around now and then: a slow sway that rests near straight ahead most of the time.
export const glance = (now: number, ph: number) => { const t = now * 0.00045 + ph * 4; return Math.sin(t) ** 3 * 0.55 + Math.sin(t * 2.7) * 0.06; };
// walk: gait phase while moving (null = standing or reduced motion); reach lifts both arms forward.
export function pose(f: Fig, walk: number | null, reach = 0, seated = false) {
  const s = walk == null ? 0 : Math.sin(walk);
  f.hips[0].rotation.x = seated ? -1.5 : s * 0.5;
  f.hips[1].rotation.x = seated ? -1.5 : -s * 0.5;
  f.knees[0].rotation.x = seated ? 1.5 : Math.max(0, -s) * 0.6;
  f.knees[1].rotation.x = seated ? 1.5 : Math.max(0, s) * 0.6;
  f.arms[0].rotation.x = -reach - (reach ? 0 : s * 0.45);
  f.arms[1].rotation.x = -reach + (reach ? 0 : s * 0.45);
  f.arms[1].rotation.z = 0;
  f.elbows[0].rotation.x = reach ? -0.35 : -0.15 - Math.max(0, s) * 0.35;
  f.elbows[1].rotation.x = reach ? -0.35 : -0.15 - Math.max(0, -s) * 0.35;
}
// Looking at a phone: right forearm up in front of the chest, head tipped down to the screen.
export function texting(f: Fig, on: boolean) {
  if (f.phone) f.phone.visible = on;
  f.head.rotation.x = on ? 0.38 : 0;
  if (!on) return;
  f.arms[1].rotation.x = -0.35;
  f.arms[1].rotation.z = -0.45;
  f.elbows[1].rotation.x = -1.45;
  f.head.rotation.y = 0;
}
