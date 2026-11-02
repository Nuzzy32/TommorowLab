import * as THREE from 'three';

// Visual-only canteen. Layout, walking, chairs and eating never feed back into the model;
// the scene only mirrors which customer ids are waiting or in service.

export type SceneCustomer = { id: string; manual: boolean };
export type SceneView = {
  c: number;
  live: boolean;
  runKey: string;
  speed: number;
  rot: number;
  zoom: number;
  resetNonce: number;
  waiting: SceneCustomer[];
  serving: (SceneCustomer | null)[];
};
export type CanteenScene = { update(view: SceneView): void; dispose(): void };

export const SCENE_AVATAR_LIMIT = 40;

type XZ = [number, number];
type Node = { v: THREE.Vector3; face?: number; wait?: number; fn?: () => void };
type Chair = { x: number; z: number; tz: number; s: number; aisle: number; busy: boolean };
// Low-poly person: hips/knees/arms are pivots so legs swing and bend to sit; `shirt` meshes carry the status colour.
type Fig = { g: THREE.Group; head: THREE.Mesh; hips: THREE.Group[]; knees: THREE.Group[]; arms: THREE.Group[]; shirt: THREE.Mesh[] };
type Look = { shirt: THREE.Material; pants: THREE.Material; skin: THREE.Material; hair?: THREE.Material; hat?: 'chef' | 'hard'; apron?: THREE.Material };
// Staff loop over `route`; `busy` undefined means they work only while paused at a stop.
type Crew = { f: Fig; route: Node[]; i: number; wait: number; ph: number; busy?: boolean; seated?: boolean; tool?: THREE.Object3D; load?: THREE.Object3D };
type Agent = {
  f: Fig; path: Node[]; laneEnd: number;
  stage: 'queue' | 'serve' | 'dine' | 'eat' | 'exit'; counter: number; wait: number; ph: number;
  leaving?: boolean; chair?: Chair; tray?: THREE.Group | null; food?: THREE.Mesh;
  eatT?: number; eatDur?: number; fading?: number; fade?: THREE.Material[];
};
type CounterLabel = { el: HTMLDivElement; st: HTMLSpanElement; dot: HTMLSpanElement; body: THREE.MeshStandardMaterial; strip: THREE.MeshStandardMaterial; p: THREE.Vector3 };

const FW = 28, FD = 18, FY = 0.12;
const SLOT = (k: number): XZ => { const r = Math.floor(k / 8), col = k % 8, cc = r % 2 ? col : 7 - col; return [-4.55 + cc * 1.3, -2.2 + r * 1.3]; };
const counterXs = (c: number): [number[], number] => {
  const sp = Math.min(2.4, 13 / c), o: number[] = [];
  for (let i = 0; i < c; i++) o.push((i - (c - 1) / 2) * sp);
  return [o, Math.min(1.8, sp - 0.45)];
};
// Mostly below ~8 fps over the last frames: the 3D view would make every control sluggish (NFR-03 light mode).
const SLOW_FRAME_MS = 120;
const SLOW_WINDOW = 15;
const SLOW_IN_WINDOW = 12;
const LABEL_FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

/** `onTooSlow` fires once if most recent frames take longer than SLOW_FRAME_MS, e.g. software WebGL on a weak device. */
export function createCanteen(host: HTMLElement, onContextLost: () => void, onTooSlow: (() => void) | null = null): CanteenScene {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cvs = renderer.domElement;
  cvs.className = 'scene-canvas';
  cvs.setAttribute('aria-hidden', 'true');
  host.appendChild(cvs);
  const overlay = document.createElement('div');
  overlay.className = 'scene-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  host.appendChild(overlay);
  const lost = (e: Event) => { e.preventDefault(); onContextLost(); };
  cvs.addEventListener('webglcontextlost', lost);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.7, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc4cdc8, 1.25));
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
  sun.position.set(-12, 26, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun);

  const trash: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => (trash.push(x), x);
  const M = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
    T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  const world = new THREE.Group();
  scene.add(world);
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const sh = new THREE.Mesh(T(new THREE.PlaneGeometry(160, 160)), T(new THREE.ShadowMaterial({ opacity: 0.12 })));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.001;
  sh.receiveShadow = true;
  scene.add(sh);
  box(world, FW, FY, FD, M('#F2F4F2', { roughness: 0.95 }), 0, FY / 2, 0, false);
  const gl: number[] = [];
  for (let x = -FW / 2 + 1; x < FW / 2; x += 1) gl.push(x, FY + 0.003, -FD / 2, x, FY + 0.003, FD / 2);
  for (let z = -FD / 2 + 1; z < FD / 2; z += 1) gl.push(-FW / 2, FY + 0.003, z, FW / 2, FY + 0.003, z);
  const gg = T(new THREE.BufferGeometry());
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
  world.add(new THREE.LineSegments(gg, T(new THREE.LineBasicMaterial({ color: 0x1f6f57, transparent: true, opacity: 0.06 }))));

  const wSide = M('#BE9F74'), wTop = M('#EFE3CF');
  const wMats = [wSide, wSide, wTop, wSide, wSide, wSide];
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 1.5, t = 0.24) => {
    const dx = x2 - x1, dz = z2 - z1;
    const m = new THREE.Mesh(T(new THREE.BoxGeometry(Math.hypot(dx, dz) + t, h, t)), wMats);
    m.position.set((x1 + x2) / 2, FY + h / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.castShadow = m.receiveShadow = true;
    world.add(m);
  };
  const H2 = FW / 2, D2 = FD / 2;
  wall(-H2, -D2, H2, -D2); wall(-H2, -D2, -H2, D2); wall(H2, -D2, H2, D2);
  wall(-H2, D2, -6.6, D2); wall(-2.4, D2, 9.2, D2); wall(11.2, D2, H2, D2);
  box(world, 4.2, 0.08, 1.8, M('#E6EBE8', { roughness: 0.95 }), -4.5, 0.04, D2 + 0.9, false);
  box(world, 2.0, 0.08, 1.8, M('#E6EBE8', { roughness: 0.95 }), 10.2, 0.04, D2 + 0.9, false);
  wall(-7.2, -D2, -7.2, -5.9); wall(7.2, -D2, 7.2, -5.9);
  wall(-H2, -5.2, -10.6, -5.2); wall(-8.8, -5.2, -7.2, -5.2);
  wall(7.2, -5.2, 10.4, -5.2);
  wall(-H2, 3.6, -11.6, 3.6); wall(-10.2, 3.6, -10.2, 6.6); wall(-10.2, 8.2, -10.2, D2);
  wall(-10.2, -5.2, -10.2, -2.4, 1.5);
  wall(7.4, -3.2, 7.4, -0.6, 0.9, 0.18); wall(7.4, 2.6, 7.4, 6.2, 0.9, 0.18);

  const dummy = new THREE.Object3D();
  // One draw call for every copy of a prop; rows are [x, y, z, rotY?].
  const many = (geo: THREE.BufferGeometry, mat: THREE.Material, at: number[][], cast = true) => {
    const m = T(new THREE.InstancedMesh(T(geo), mat, at.length));
    at.forEach(([x, y, z, ry = 0], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.castShadow = cast;
    m.receiveShadow = true;
    world.add(m);
  };
  const mats = {
    w: M('#E9B949', { roughness: 0.6 }), s: M('#2E8B6C', { roughness: 0.6 }), tag: M('#4C5FD5', { roughness: 0.4 }),
    plate: M('#FFFFFF', { roughness: 0.3 }), food: [M('#E39A4B'), M('#D8693E'), M('#C9B25A'), M('#9DBE6A')], cup: M('#7FB7D8', { roughness: 0.2 }),
  };
  const skins = ['#F1D3B5', '#E0B48F', '#C68E64', '#8D5A3B'].map(c => M(c, { roughness: 0.7 }));
  const hairs = ['#2B2522', '#4A3426', '#1C1C1C', '#7A5636', '#B8B0A6'].map(c => M(c));
  const pants = ['#3B4A5C', '#2F3B33', '#5C5248', '#26304A', '#6B7280'].map(c => M(c));
  const crewM = { coat: M('#F7F7F5', { roughness: 0.7 }), slacks: M('#2F3B35'), apron: M('#3D4A45'), denim: M('#2F6FB8'), hard: M('#F2C230', { roughness: 0.4 }), teal: M('#5B8A9A') };
  const pick = <X,>(xs: X[]) => xs[Math.floor(Math.random() * xs.length)];

  const gThigh = T(new THREE.BoxGeometry(0.12, 0.25, 0.14).translate(0, -0.125, 0));
  const gShin = T(new THREE.BoxGeometry(0.11, 0.27, 0.13).translate(0, -0.135, 0.01));
  const gTorso = T(new THREE.CapsuleGeometry(0.15, 0.2, 4, 10).scale(1, 1, 0.66));
  const gArm = T(new THREE.CapsuleGeometry(0.045, 0.3, 3, 8).translate(0, -0.19, 0));
  const gSkull = T(new THREE.SphereGeometry(0.11, 16, 12)), gHair = T(new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const gChef = T(new THREE.CylinderGeometry(0.12, 0.1, 0.16, 14)), gHard = T(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const gApron = T(new THREE.BoxGeometry(0.24, 0.4, 0.02));
  const HIP = FY + 0.52, HEAD = FY + 1.11, SEAT_DROP = -0.16;
  function person(parent: THREE.Object3D, k: Look, x: number, z: number, ry: number): Fig {
    const g = new THREE.Group();
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, into: THREE.Object3D, px: number, py: number, pz: number, cast = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = cast;
      into.add(m);
      return m;
    };
    const joint = (into: THREE.Object3D, px: number, py: number) => { const j = new THREE.Group(); j.position.set(px, py, 0); into.add(j); return j; };
    const hips = [-0.08, 0.08].map(o => joint(g, o, HIP)), knees = hips.map(h => joint(h, 0, -0.25));
    hips.forEach(h => part(gThigh, k.pants, h, 0, 0, 0));
    knees.forEach(n => part(gShin, k.pants, n, 0, 0, 0));
    const arms = [-0.2, 0.2].map(o => joint(g, o, FY + 0.93));
    const shirt = [part(gTorso, k.shirt, g, 0, HIP + 0.22, 0, true), ...arms.map(a => part(gArm, k.shirt, a, 0, 0, 0))];
    const head = part(gSkull, k.skin, g, 0, HEAD, 0, true);
    if (k.hair) part(gHair, k.hair, head, 0, 0.012, -0.008);
    if (k.hat === 'chef') part(gChef, crewM.coat, head, 0, 0.13, 0);
    if (k.hat === 'hard') part(gHard, crewM.hard, head, 0, 0.02, 0);
    if (k.apron) part(gApron, k.apron, g, 0, HIP + 0.17, 0.105);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    parent.add(g);
    return { g, head, hips, knees, arms, shirt };
  }
  // walk: gait phase while moving (null = standing); reach lifts both arms forward.
  function pose(f: Fig, walk: number | null, reach = 0, seated = false) {
    const s = walk == null || reduced ? 0 : Math.sin(walk);
    f.hips[0].rotation.x = seated ? -1.5 : s * 0.5;
    f.hips[1].rotation.x = seated ? -1.5 : -s * 0.5;
    f.knees[0].rotation.x = seated ? 1.5 : Math.max(0, -s) * 0.6;
    f.knees[1].rotation.x = seated ? 1.5 : Math.max(0, s) * 0.6;
    f.arms[0].rotation.x = -reach - (reach ? 0 : s * 0.45);
    f.arms[1].rotation.x = -reach + (reach ? 0 : s * 0.45);
  }

  const steel = M('#D9E0DD', { roughness: 0.35, metalness: 0.35 }), dark = M('#5E6B66', { roughness: 0.5 });
  const wood = M('#EFE6D8'), seatM = M('#8FB3A4'), crate = M('#C9A26B'), pallet = M('#B08A5A'), leaf = M('#5E9B6A', { roughness: 0.9 }), potM = M('#D9CBB5');
  box(world, 5.2, 0.7, 0.8, steel, -3.6, FY + 0.35, -8.35);
  box(world, 5.2, 0.7, 0.8, steel, 3.6, FY + 0.35, -8.35);
  [-5.4, -3.6, -1.8].forEach(x => box(world, 0.9, 0.04, 0.6, dark, x, FY + 0.72, -8.35));
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), -6.4, FY + 0.95, -6.9);
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), 6.4, FY + 0.95, -6.9);
  box(world, 4.2, 0.7, 0.7, steel, 0, FY + 0.35, -7.0);
  for (let i = 0; i < 3; i++) box(world, 0.9, 0.9, 0.6, M('#DCE4F2'), -13.3, FY + 0.45, -8.4 + i * 1.1);
  box(world, 0.6, 0.85, 3.2, M('#E4EBE8'), -13.5, FY + 0.43, -0.4);
  // Kitchen: pots and a wok on the burners, a prep board, plate stacks and filled pans on the island.
  many(new THREE.CylinderGeometry(0.17, 0.15, 0.18, 16), dark, [[-5.4, FY + 0.83, -8.35], [-1.8, FY + 0.83, -8.35]]);
  many(new THREE.CylinderGeometry(0.24, 0.1, 0.1, 16), M('#2F3533', { roughness: 0.4, metalness: 0.4 }), [[-3.6, FY + 0.79, -8.35]]);
  box(world, 0.55, 0.03, 0.34, M('#D7B98C'), 3.0, FY + 0.715, -8.35, false);
  many(new THREE.SphereGeometry(0.06, 10, 8), mats.food[3], [[2.85, FY + 0.77, -8.4], [2.97, FY + 0.77, -8.3], [3.1, FY + 0.77, -8.42]], false);
  many(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 18), mats.plate, [[4.9, FY + 0.78, -8.35], [5.4, FY + 0.78, -8.35]]);
  [-1.2, 0, 1.2].forEach((x, i) => box(world, 0.6, 0.07, 0.4, mats.food[i], x, FY + 0.74, -7.0, false));

  const chairs: Chair[] = [], AISLE = [-3.65, -0.75, 2.55, 5.6, 8.45];
  const seats: number[][] = [], backs: number[][] = [], stems: number[][] = [], tops: number[][] = [], tlegs: number[][] = [], vases: number[][] = [];
  const chairAt = (x: number, z: number, s: number) => { seats.push([x, FY + 0.315, z]); backs.push([x, FY + 0.55, z + s * 0.2]); stems.push([x, FY + 0.15, z]); };
  [9.3, 12.3].forEach(tx => [-2.4, 0.9, 4.2, 7.0].forEach((tz, r) => {
    tops.push([tx, FY + 0.59, tz]);
    tlegs.push([tx - 0.75, FY + 0.28, tz], [tx + 0.75, FY + 0.28, tz]);
    vases.push([tx, FY + 0.68, tz]);
    [-0.5, 0.5].forEach(o => [-1, 1].forEach(s => {
      chairAt(tx + o, tz + s * 0.8, s);
      chairs.push({ x: tx + o, z: tz + s * 0.76, tz, s, aisle: s < 0 ? AISLE[r] : AISLE[r + 1], busy: false });
    }));
  }));
  // Staff room: lockers, a vending machine and a small table where one worker takes a break.
  many(new THREE.BoxGeometry(0.6, 1.5, 0.45), M('#9DB4C0', { roughness: 0.5, metalness: 0.2 }), [8.1, 8.75, 9.4, 10.05].map(x => [x, FY + 0.75, -8.55]));
  box(world, 0.8, 1.7, 0.6, M('#C9463D', { roughness: 0.4 }), 13.35, FY + 0.85, -8.45);
  box(world, 0.6, 1.0, 0.02, M('#DDEFF5', { emissive: '#7FB7D8', emissiveIntensity: 0.25 }), 13.35, FY + 1.0, -8.14, false);
  many(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), wood, [[11.6, FY + 0.6, -6.7]]);
  many(new THREE.CylinderGeometry(0.05, 0.12, 0.58, 12), dark, [[11.6, FY + 0.29, -6.7]], false);
  chairAt(11.6, -7.35, -1);
  chairAt(11.6, -6.05, 1);
  many(new THREE.BoxGeometry(0.42, 0.05, 0.42), seatM, seats);
  many(new THREE.BoxGeometry(0.42, 0.42, 0.05), seatM, backs);
  many(new THREE.BoxGeometry(0.06, 0.3, 0.06), dark, stems, false);
  many(new THREE.BoxGeometry(1.9, 0.06, 1.0), wood, tops);
  many(new THREE.BoxGeometry(0.06, 0.56, 0.6), dark, tlegs, false);
  many(new THREE.CylinderGeometry(0.045, 0.04, 0.12, 10), mats.plate, vases, false);
  many(new THREE.SphereGeometry(0.06, 8, 6), leaf, vases.map(([x, y, z]) => [x, y + 0.09, z]), false);
  many(new THREE.CylinderGeometry(0.05, 0.045, 0.12, 12), mats.cup, [[11.45, FY + 0.69, -6.85]], false);
  // Store room: pallets stacked with crates. Wash area: sinks with mirrors.
  const stacks: number[][] = [];
  [-8.0, -6.6].forEach((z, p) => [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([dx, dz], i) => {
    for (let lv = 0; lv < (i === 3 && p ? 1 : 2); lv++) stacks.push([-11.5 + dx, FY + 0.3 + lv * 0.38, z + dz, (i + lv) * 0.08]);
  }));
  many(new THREE.BoxGeometry(0.95, 0.12, 0.95), pallet, [[-11.5, FY + 0.06, -8.0], [-11.5, FY + 0.06, -6.6]]);
  many(new THREE.BoxGeometry(0.4, 0.36, 0.4), crate, stacks);
  const sinks = [4.6, 5.9, 7.2];
  many(new THREE.BoxGeometry(0.55, 0.8, 0.9), M('#F4F6F5', { roughness: 0.4 }), sinks.map(z => [-13.55, FY + 0.4, z]));
  many(new THREE.BoxGeometry(0.36, 0.03, 0.5), M('#B9C6BF', { roughness: 0.2, metalness: 0.3 }), sinks.map(z => [-13.5, FY + 0.81, z]), false);
  many(new THREE.BoxGeometry(0.03, 0.45, 0.6), M('#DDEFF5', { roughness: 0.05, metalness: 0.5 }), sinks.map(z => [-13.84, FY + 1.15, z]), false);
  // Plants, bins, a drinks fridge and a menu board around the room.
  const plants = [[-7.0, 8.5], [-1.95, 8.5], [7.75, -4.6], [6.6, 7.6], [-9.6, 3.0], [13.45, 5.6]];
  many(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 14), potM, plants.map(([x, z]) => [x, FY + 0.175, z]));
  many(new THREE.IcosahedronGeometry(0.34, 0), leaf, plants.map(([x, z], i) => [x, FY + 0.6, z, i]));
  many(new THREE.CylinderGeometry(0.18, 0.16, 0.5, 14), M('#3F6B57'), [[13.45, FY + 0.25, 8.5], [13.45, FY + 0.25, -3.5]]);
  box(world, 0.6, 1.6, 0.6, M('#E6ECEA', { roughness: 0.4 }), 13.5, FY + 0.8, 2.55);
  box(world, 0.02, 1.25, 0.48, M('#BFE3F2', { emissive: '#5FA8C8', emissiveIntensity: 0.35 }), 13.19, FY + 0.88, 2.55, false);
  box(world, 0.5, 0.7, 0.06, M('#2F3B35'), -2.0, FY + 0.45, 7.3).rotation.y = 0.5;

  const postM = M('#6E7C76', { roughness: 0.4, metalness: 0.4 }), beltM = M('#C8961E', { roughness: 0.6 });
  const gPost = T(new THREE.CylinderGeometry(0.045, 0.06, 0.9, 10));
  const post = (x: number, z: number) => { const p = new THREE.Mesh(gPost, postM); p.position.set(x, FY + 0.45, z); p.castShadow = true; world.add(p); };
  const belt = (x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    const b = new THREE.Mesh(T(new THREE.BoxGeometry(len, 0.06, 0.025)), beltM);
    b.position.set((x1 + x2) / 2, FY + 0.82, (z1 + z2) / 2);
    b.rotation.y = -Math.atan2(dz, dx);
    b.castShadow = true;
    world.add(b);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) post(x1 + dx * i / n, z1 + dz * i / n);
  };
  for (let r = 0; r < 4; r++) { const z = -2.2 + r * 1.3 + 0.65; if (r % 2) belt(-5.2, z, 3.9, z); else belt(-3.9, z, 5.2, z); }
  belt(-3.9, 3.65, 5.2, 3.65); belt(-5.2, -1.55, -5.2, 3.0); belt(5.2, -1.55, 5.2, 3.65);

  const labelers: (() => void)[] = [];
  const zone = (x1: number, z1: number, x2: number, z2: number, color: string, text: string, h = 1.2) => {
    const w = x2 - x1, d = z2 - z1, geo = T(new THREE.BoxGeometry(w, h, d));
    const vol = new THREE.Mesh(geo, T(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.13, roughness: 0.15, depthWrite: false })));
    vol.position.set(x1 + w / 2, FY + h / 2, z1 + d / 2);
    vol.renderOrder = 3;
    world.add(vol);
    const ed = new THREE.LineSegments(T(new THREE.EdgesGeometry(geo)), T(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })));
    ed.position.copy(vol.position);
    ed.renderOrder = 4;
    world.add(ed);
    const tint = new THREE.Mesh(T(new THREE.PlaneGeometry(w, d)), T(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false })));
    tint.rotation.x = -Math.PI / 2;
    tint.position.set(x1 + w / 2, FY + 0.006, z1 + d / 2);
    world.add(tint);
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    if (!ctx) return;
    const tex = T(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const lab = new THREE.Mesh(T(new THREE.PlaneGeometry(1, 1)), T(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })));
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(x1 + w / 2, FY + h + 0.02, z1 + d / 2);
    lab.renderOrder = 10;
    world.add(lab);
    const draw = () => {
      const f = `700 120px ${LABEL_FONT}`;
      ctx.font = f;
      const tw = Math.ceil(ctx.measureText(text).width);
      cv.width = tw + 60;
      cv.height = 170;
      ctx.font = f;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 26;
      ctx.strokeText(text, 30, 88);
      ctx.fillStyle = color;
      ctx.fillText(text, 30, 88);
      tex.needsUpdate = true;
      let lh = Math.min(1.25, d * 0.3), lw = lh * cv.width / cv.height;
      if (lw > w * 0.9) { lh *= w * 0.9 / lw; lw = w * 0.9; }
      lab.scale.set(lw, lh, 1);
    };
    draw();
    labelers.push(draw);
  };
  zone(-7.0, -9.0 + 0.15, 7.0, -5.95, '#2E8B6C', 'Dapur');
  zone(-6.0, -3.0, 6.0, 4.3, '#9A6E0C', 'Antrean');
  zone(7.7, -3.9, 13.85, 8.85, '#2F5BAA', 'Area makan');
  zone(-6.4, 5.2, -2.6, 8.85, '#5A45B8', 'Pintu masuk', 0.9);
  zone(-13.85, -8.85, -10.4, -5.35, '#5E4E38', 'Gudang', 1.0);
  zone(-13.85, 3.75, -10.35, 8.85, '#3D7A96', 'Wastafel', 1.0);
  zone(9.25, D2 + 0.05, 11.15, D2 + 1.75, '#55635D', 'Keluar', 0.5);
  void document.fonts?.ready.then(() => labelers.forEach(f => f()));

  let C = 0, counters = new THREE.Group(), xs: number[] = [], cLabels: CounterLabel[] = [];
  world.add(counters);
  const glass = M('#FFFFFF', { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false });
  const ringGeo = T(new THREE.RingGeometry(0.32, 0.4, 32));
  const ringMat = T(new THREE.MeshBasicMaterial({ color: '#2E8B6C', transparent: true, opacity: 0.35 }));
  const counterTrash: { dispose(): void }[] = [];
  const N = (p: XZ, o: Omit<Node, 'v'> = {}): Node => ({ v: new THREE.Vector3(p[0], 0, p[1]), ...o });
  const kitchen = (): Look => ({ shirt: crewM.coat, pants: crewM.slacks, skin: pick(skins), hat: 'chef', apron: crewM.apron });
  const staff = (k: Look, route: Node[], extra: Partial<Crew> = {}, parent: THREE.Object3D = world): Crew => {
    const { x, z } = route[0].v;
    return { f: person(parent, k, x, z, route[0].face ?? 0), route, i: 0, wait: 0, ph: Math.random() * 6, ...extra };
  };
  let servers: Crew[] = [];
  const crew: Crew[] = [
    staff(kitchen(), [N([-3.6, -7.7], { face: Math.PI, wait: Infinity })], { busy: true }),
    staff(kitchen(), [N([3.0, -7.7], { face: Math.PI, wait: Infinity })], { busy: true }),
    staff(kitchen(), [N([0, -7.66], { face: 0, wait: Infinity })], { busy: true }),
    staff({ shirt: crewM.coat, pants: pick(pants), skin: pick(skins), hair: pick(hairs) }, [N([11.6, -7.35], { face: 0, wait: Infinity })], { busy: false, seated: true }),
  ];
  {
    // Store hand: picks a crate off the shelves, carries it to the kitchen fridge, comes back.
    const lane = N([-12.4, -5.6]), door = N([-6.8, -5.6]);
    const w = staff({ shirt: crewM.coat, pants: crewM.denim, apron: crewM.denim, skin: pick(skins), hat: 'hard' }, [
      N([-12.4, -7.3], { face: -Math.PI / 2, wait: 3 }), N([-12.4, -7.3], { fn: () => { w.load!.visible = true; } }), lane, door,
      N([-6.55, -6.3], { face: Math.PI, wait: 2.5, fn: () => { w.load!.visible = false; } }), door, lane,
    ]);
    w.load = box(w.f.g, 0.36, 0.3, 0.3, crate, 0, FY + 0.78, 0.32);
    w.load.visible = false;
    // Cleaner mops the dining corridor in stops.
    const c = staff({ shirt: crewM.teal, pants: crewM.slacks, skin: pick(skins), hair: pick(hairs) },
      [N([10.8, -3.0], { wait: 4 }), N([10.8, 2.55], { wait: 4 }), N([10.8, 8.0], { wait: 4 }), N([10.8, 2.55], { wait: 3 })]);
    c.tool = new THREE.Group();
    c.tool.position.set(0.1, FY, 0.42);
    box(c.tool, 0.03, 0.95, 0.03, dark, 0, 0.45, -0.15, false).rotation.x = -0.35;
    box(c.tool, 0.36, 0.05, 0.14, crewM.teal, 0, 0.03, 0, false);
    c.f.g.add(c.tool);
    crew.push(w, c);
  }
  function buildCounters(c: number) {
    counterTrash.splice(0).forEach(x => x.dispose());
    world.remove(counters);
    counters = new THREE.Group();
    world.add(counters);
    cLabels.forEach(l => l.el.remove());
    cLabels = [];
    let cw: number;
    [xs, cw] = counterXs(c);
    C = c;
    const own = <X extends { dispose(): void }>(x: X) => (counterTrash.push(x), x);
    const cbox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
      const m = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      counters.add(m);
      return m;
    };
    const top = own(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.3 }));
    servers = xs.map(x => staff(kitchen(), [N([x, -6.2], { face: 0, wait: Infinity })], { busy: false }, counters));
    xs.forEach((x, i) => {
      const body = own(new THREE.MeshStandardMaterial({ color: '#F3F6F4', roughness: 0.6 }));
      const strip = own(new THREE.MeshStandardMaterial({ color: '#B9C6BF', emissive: '#000000', roughness: 0.4 }));
      cbox(cw, 0.75, 0.9, body, x, FY + 0.375, -5.45);
      cbox(cw + 0.12, 0.07, 1.05, top, x, FY + 0.78, -5.45);
      cbox(cw * 0.92, 0.07, 0.05, strip, x, FY + 0.64, -4.98, false);
      cbox(cw, 0.45, 0.04, glass, x, FY + 1.04, -5.75, false).renderOrder = 6;
      [-1, 0, 1].forEach(k => cbox(cw * 0.26, 0.06, 0.3, mats.food[(i + k + 1) % 4], x + k * cw * 0.3, FY + 0.85, -5.55, false));
      cbox(0.22, 0.14, 0.18, dark, x + cw / 2 - 0.18, FY + 0.89, -5.12);
      const pad = new THREE.Mesh(ringGeo, ringMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, FY + 0.01, -4.35);
      counters.add(pad);
      const el = document.createElement('div');
      el.className = 'scene-counter-label';
      const dot = document.createElement('span');
      dot.className = 'scene-counter-dot';
      const name = document.createElement('b');
      name.textContent = `L${i + 1}`;
      const st = document.createElement('span');
      st.className = 'scene-counter-status';
      el.append(dot, name, st);
      overlay.appendChild(el);
      cLabels.push({ el, st, dot, body, strip, p: new THREE.Vector3(x, FY + 2.3, -6.2) });
    });
  }

  const gTag = T(new THREE.SphereGeometry(0.075, 10, 8));
  const gPlate = T(new THREE.CylinderGeometry(0.2, 0.17, 0.03, 20)), gFood = T(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), gCup = T(new THREE.CylinderGeometry(0.05, 0.045, 0.13, 12));
  const agents = new Map<string, Agent>();
  const ENTRY: XZ = [-4.55, 4.45];
  let runKey: string | null = null, speedMul = 1;

  function spawn(u: SceneCustomer) {
    const j = (Math.random() - 0.5) * 1.6;
    const f = person(world, { shirt: mats.w, pants: pick(pants), skin: pick(skins), hair: pick(hairs) }, -4.5 + j, D2 + 1.4, Math.PI);
    if (u.manual) { const t = new THREE.Mesh(gTag, mats.tag); t.position.y = FY + 1.36; f.g.add(t); }
    const a: Agent = { f, path: [N([-4.5 + j * 0.6, 6.6]), N(ENTRY)], laneEnd: SCENE_AVATAR_LIMIT, stage: 'queue', counter: 0, wait: 0, ph: Math.random() * 6 };
    agents.set(u.id, a);
    return a;
  }
  function toCounter(a: Agent, i: number) {
    for (let j = a.laneEnd - 1; j >= 0; j--) a.path.push(N(SLOT(j)));
    const cx = xs[i] ?? 0;
    a.path.push(N([5.0, -3.3]), N([cx, -3.3]), N([cx, -4.35], { face: Math.PI }));
    a.laneEnd = -1;
    a.stage = 'serve';
    a.counter = i;
    a.f.shirt.forEach(m => { m.material = mats.s; });
  }
  function exitPath(a: Agent, fromAisle: number | null) {
    const p = fromAisle != null && a.chair ? [N([a.chair.x, fromAisle]), N([10.8, fromAisle])] : [N([10.8, -3.65])];
    p.push(N([10.8, 8.45]), N([10.2, D2]), N([10.2, D2 + 1.5], { fn: () => { a.fading = 0; } }));
    return p;
  }
  function leave(a: Agent) {
    a.leaving = true;
    if (a.laneEnd >= 0) toCounter(a, 0);
    const cx = xs[a.counter] ?? 0;
    a.path.push(N([cx, -4.35], { wait: 0.6, face: Math.PI, fn: () => { a.stage = 'dine'; takeTray(a); } }));
    a.path.push(N([cx, -3.4]), N([6.7, -3.65]), N([7.9, -3.65]));
    const free = chairs.filter(c => !c.busy);
    if (!free.length) { a.path.push(...exitPath(a, null)); return; }
    const ch = free[Math.floor(Math.random() * free.length)];
    ch.busy = true;
    a.chair = ch;
    a.path.push(N([7.9, ch.aisle]), N([ch.x, ch.aisle]), N([ch.x, ch.z], { face: ch.s < 0 ? 0 : Math.PI, fn: () => sit(a) }));
  }
  // The meal is carried from the counter in both hands, then set down on the table at `sit`.
  function takeTray(a: Agent) {
    const tr = new THREE.Group(), pl = new THREE.Mesh(gPlate, mats.plate), fd = new THREE.Mesh(gFood, pick(mats.food)), cu = new THREE.Mesh(gCup, mats.cup);
    pl.position.y = 0.015;
    fd.position.y = 0.03;
    cu.position.set(0.24, 0.065, 0);
    pl.castShadow = cu.castShadow = true;
    tr.add(pl, fd, cu);
    tr.position.set(0, FY + 0.78, 0.34);
    a.f.g.add(tr);
    a.tray = tr;
    a.food = fd;
    return tr;
  }
  function sit(a: Agent) {
    const ch = a.chair!;
    a.stage = 'eat';
    a.eatT = 0;
    a.eatDur = (9 + Math.random() * 7) * speedMul;
    const tr = a.tray ?? takeTray(a);
    world.add(tr);
    tr.position.set(ch.x, FY + 0.62, ch.tz + ch.s * 0.26);
  }
  function stand(a: Agent) {
    a.stage = 'exit';
    a.f.head.position.y = HEAD;
    if (a.tray) { world.remove(a.tray); a.tray = null; }
    const aisle = a.chair!.aisle;
    a.chair!.busy = false;
    a.path = exitPath(a, aisle);
  }
  function remove(id: string, a: Agent) {
    world.remove(a.f.g);
    if (a.tray) world.remove(a.tray);
    if (a.chair && a.stage !== 'exit') a.chair.busy = false;
    a.fade?.forEach(m => m.dispose());
    agents.delete(id);
  }
  function clearAll() { [...agents].forEach(([id, a]) => remove(id, a)); chairs.forEach(c => { c.busy = false; }); }

  let last: SceneView | null = null;
  function update(view: SceneView) {
    last = view;
    speedMul = view.speed === 1 ? 2.4 : view.speed === 5 ? 1.4 : 1;
    if (view.c !== C) { clearAll(); buildCounters(view.c); }
    view.serving.forEach((u, i) => {
      const L = cLabels[i];
      if (!L) return;
      const busy = !!u;
      if (servers[i]) servers[i].busy = busy;
      L.st.textContent = busy ? 'Melayani' : 'Kosong';
      L.el.dataset.busy = String(busy);
      L.st.hidden = C > 3;
      L.body.color.set(busy ? '#CDEBDD' : '#F3F6F4');
      L.strip.color.set(busy ? '#2E8B6C' : '#B9C6BF');
      L.strip.emissive.set(busy ? '#1E6B52' : '#000000');
    });
    if (view.runKey !== runKey) { clearAll(); runKey = view.runKey; }
    if (!view.live) { clearAll(); return; }
    const want = new Map<string, { u: SceneCustomer; k: number; st: 'w' } | { u: SceneCustomer; i: number; st: 's' }>();
    view.waiting.slice(0, SCENE_AVATAR_LIMIT).forEach((u, k) => want.set(u.id, { u, k, st: 'w' }));
    view.serving.forEach((u, i) => { if (u) want.set(u.id, { u, i, st: 's' }); });
    want.forEach((w, id) => {
      const a = agents.get(id) ?? spawn(w.u);
      if (a.leaving) return;
      if (w.st === 'w') {
        if (w.k < a.laneEnd) { for (let j = a.laneEnd - 1; j >= w.k; j--) a.path.push(N(SLOT(j))); a.laneEnd = w.k; }
      } else if (a.stage !== 'serve') toCounter(a, w.i);
    });
    agents.forEach((a, id) => { if (!want.has(id) && !a.leaving) leave(a); });
  }

  let dAz = 0, dPol = 0, wz = 1, pinchD = 0, nonce: number | null = null;
  const cur = { az: -0.62, pol: 0.9, r: 40 };
  const ptr = { on: false, x: 0, y: 0 }, touches = new Map<number, XZ>();
  const clampZ = (z: number) => Math.max(0.55, Math.min(2.6, z));
  const baseZoom = () => last?.zoom || 1;
  // Wheel / two-finger scroll over the scene zooms; pinch (ctrlKey on trackpads) sends small deltas, so it gets a bigger k.
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.012 : 0.0025;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    wz = clampZ(baseZoom() * wz * Math.exp(-dy * k)) / baseZoom();
  }, { passive: false });
  cvs.addEventListener('pointerdown', e => {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    cvs.setPointerCapture(e.pointerId);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]);
      ptr.on = false;
    } else { ptr.on = true; ptr.x = e.clientX; ptr.y = e.clientY; cvs.style.cursor = 'grabbing'; }
  });
  cvs.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && pinchD) {
      const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      wz = clampZ(baseZoom() * wz * d / pinchD) / baseZoom();
      pinchD = d;
      return;
    }
    if (!ptr.on) return;
    dAz -= (e.clientX - ptr.x) * 0.007;
    dPol = Math.max(-0.5, Math.min(0.32, dPol - (e.clientY - ptr.y) * 0.005));
    ptr.x = e.clientX;
    ptr.y = e.clientY;
  });
  const up = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchD = 0;
    if (!touches.size) { ptr.on = false; cvs.style.cursor = ''; }
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  cvs.addEventListener('dblclick', () => { dAz = 0; dPol = 0; wz = 1; });

  let W = 0, Hh = 0;
  const ro = new ResizeObserver(() => {
    W = host.clientWidth;
    Hh = host.clientHeight;
    if (W && Hh) { renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.updateProjectionMatrix(); }
  });
  ro.observe(host);

  const tgt = new THREE.Vector3(0.4, 0, 1.4), tmp = new THREE.Vector3();
  let raf = 0, prev = performance.now(), wasHidden = false;
  const gaps: boolean[] = [];
  // Moves g toward v by up to `step`, turning to face the way; true once it arrives.
  function stepTo(g: THREE.Object3D, v: THREE.Vector3, step: number, dt: number) {
    tmp.subVectors(v, g.position);
    tmp.y = 0;
    if (tmp.length() <= step) { g.position.x = v.x; g.position.z = v.z; return true; }
    g.position.addScaledVector(tmp.normalize(), step);
    let d = Math.atan2(tmp.x, tmp.z) - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * 12);
    return false;
  }
  function tick(w: Crew, dt: number) {
    const q = w.route[w.i];
    let walk: number | null = null;
    if (w.wait > 0) w.wait -= dt;
    else if (stepTo(w.f.g, q.v, reduced ? 1e4 : 1.2 * dt, dt)) {
      if (q.face != null) w.f.g.rotation.y = q.face;
      w.wait = q.wait ?? 0;
      q.fn?.();
      w.i = (w.i + 1) % w.route.length;
    } else walk = w.ph += dt * 9;
    if (walk == null) w.ph += dt * 5;
    const working = w.busy ?? w.wait > 0, wob = reduced ? 0 : Math.sin(w.ph);
    pose(w.f, walk, w.load?.visible ? 1.25 : working ? 0.85 + wob * 0.2 : 0, w.seated);
    if (w.tool) w.tool.rotation.y = working ? wob * 0.5 : 0;
    w.f.g.position.y = w.seated ? SEAT_DROP : walk == null || reduced ? 0 : Math.abs(Math.sin(walk)) * 0.03;
  }
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    const gap = now - prev;
    prev = now;
    if (document.hidden || !W) { wasHidden = true; return; }
    // Gaps spanning a hidden period are not rendering cost.
    if (onTooSlow && !wasHidden) {
      gaps.push(gap > SLOW_FRAME_MS);
      if (gaps.length > SLOW_WINDOW) gaps.shift();
      if (gaps.filter(Boolean).length >= SLOW_IN_WINDOW) { const notify = onTooSlow; onTooSlow = null; notify(); }
    }
    wasHidden = false;
    if (last && last.resetNonce !== nonce) { if (nonce !== null) { dAz = 0; dPol = 0; wz = 1; } nonce = last.resetNonce; }
    const az = ((last?.rot ?? 0) * Math.PI) / 180;
    const zoom = clampZ(baseZoom() * wz), asp = camera.aspect || 1.7;
    const want = { az: -0.62 + az + dAz, pol: 0.9 + dPol, r: 44 / zoom * Math.max(1, 1.55 / asp) };
    const k = reduced ? 1 : 1 - Math.pow(0.001, dt);
    cur.az += (want.az - cur.az) * k;
    cur.pol += (want.pol - cur.pol) * k;
    cur.r += (want.r - cur.r) * k;
    camera.position.set(tgt.x + cur.r * Math.sin(cur.pol) * Math.sin(cur.az), cur.r * Math.cos(cur.pol), tgt.z + cur.r * Math.sin(cur.pol) * Math.cos(cur.az));
    camera.lookAt(tgt);
    agents.forEach((a, id) => {
      const p = a.f.g.position;
      if (a.fading != null) {
        a.fading += dt;
        if (!a.fade) {
          const copies = new Map<THREE.Material, THREE.Material>();
          a.f.g.traverse(o => {
            if (!(o instanceof THREE.Mesh)) return;
            const src = o.material as THREE.Material;
            let c = copies.get(src);
            if (!c) { c = src.clone(); c.transparent = true; copies.set(src, c); }
            o.material = c;
          });
          a.fade = [...copies.values()];
        }
        const o = Math.max(0, 1 - a.fading / 0.6);
        a.fade.forEach(m => { m.opacity = o; });
        if (a.fading > 0.6) { remove(id, a); return; }
      }
      if (a.stage === 'eat') {
        a.eatT! += dt;
        const e = Math.min(1, a.eatT! / a.eatDur!);
        if (a.food) { const sc = 1 - e * 0.85; a.food.scale.set(sc, sc, sc); }
        const nod = reduced ? 0 : Math.max(0, Math.sin(a.eatT! * 3.2 + a.ph));
        pose(a.f, null, 0, true);
        a.f.arms[1].rotation.x = -0.9 - nod * 0.8;
        a.f.head.position.y = HEAD - nod * 0.03;
        p.y = SEAT_DROP;
        if (e >= 1) stand(a);
        return;
      }
      let walk: number | null = null;
      if (a.wait > 0) a.wait -= dt;
      else if (a.path.length) {
        const q = a.path[0];
        let rem = Math.hypot(q.v.x - p.x, q.v.z - p.z);
        for (let i = 1; i < a.path.length; i++) rem += a.path[i - 1].v.distanceTo(a.path[i].v);
        const sp = reduced ? 1e4 : a.stage === 'dine' || a.stage === 'exit' ? 2.4 : Math.max(2.4, rem / (a.stage === 'serve' ? 2.2 : 3.2));
        if (stepTo(a.f.g, q.v, sp * dt, dt)) {
          a.path.shift();
          if (q.face != null) a.f.g.rotation.y = q.face;
          if (q.wait) a.wait = q.wait;
          q.fn?.();
        } else walk = a.ph += dt * 13;
      }
      p.y = walk == null || reduced ? 0 : Math.abs(Math.sin(walk)) * 0.03;
      pose(a.f, walk, a.tray ? 1.25 : 0);
    });
    crew.forEach(w => tick(w, dt));
    servers.forEach(w => tick(w, dt));
    const boxes = cLabels.map(L => {
      tmp.copy(L.p).project(camera);
      const w = L.el.offsetWidth || 60, h = L.el.offsetHeight || 22;
      return { L, vis: tmp.z < 1, x: (tmp.x + 1) / 2 * W - w / 2, y: (1 - tmp.y) / 2 * Hh - h, w, h };
    }).filter(b => { b.L.el.style.display = b.vis ? 'flex' : 'none'; return b.vis; });
    boxes.sort((a, b) => a.x - b.x);
    for (let it = 0; it < 4; it++) for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1], b = boxes[i];
      if (b.x < a.x + a.w + 4 && Math.abs(b.y - a.y) < a.h + 4) b.y = a.y - b.h - 6;
    }
    boxes.forEach(b => { b.L.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`; });
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cvs.removeEventListener('webglcontextlost', lost);
      counterTrash.forEach(x => x.dispose());
      trash.forEach(x => x.dispose());
      agents.forEach(a => a.fade?.forEach(m => m.dispose()));
      renderer.dispose();
      // Free the GL context now; browsers cap live contexts per page and StrictMode mounts twice.
      renderer.forceContextLoss();
      cvs.remove();
      overlay.remove();
    },
  };
}
