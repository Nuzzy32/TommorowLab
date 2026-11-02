import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  /** First-person walk through the canteen instead of the orbit view. */
  walk: boolean;
  /** Ambient sound from public/audio; off until the viewer turns it on. */
  sound: boolean;
  waiting: SceneCustomer[];
  serving: (SceneCustomer | null)[];
};
export type CanteenScene = { update(view: SceneView): void; dispose(): void };

export const SCENE_AVATAR_LIMIT = 40;

type XZ = [number, number];
type Node = { v: THREE.Vector3; face?: number; wait?: number; fn?: () => void };
type Chair = { x: number; z: number; tz: number; s: number; aisle: number; busy: boolean };
// Low-poly person: hips/knees/arms are pivots so legs swing and bend to sit; `shirt` meshes carry the status colour.
type Fig = { g: THREE.Group; head: THREE.Mesh; hips: THREE.Group[]; knees: THREE.Group[]; arms: THREE.Group[]; elbows: THREE.Group[]; shirt: THREE.Mesh[]; phone?: THREE.Mesh };
type Look = {
  shirt: THREE.Material; pants: THREE.Material; skin: THREE.Material; hair?: THREE.Material; style?: 'short' | 'long' | 'bun'; hijab?: THREE.Material;
  glasses?: boolean; bag?: THREE.Material; sleeves?: boolean; hat?: 'chef' | 'hard'; hatMat?: THREE.Material; apron?: THREE.Material; phone?: boolean;
};
// Staff loop over `route`; `busy` undefined means they work only while paused at a stop.
type Crew = { f: Fig; route: Node[]; i: number; wait: number; ph: number; busy?: boolean; seated?: boolean; texting?: boolean; tool?: THREE.Object3D; load?: THREE.Object3D };
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
  // Canvas-drawn floors: each texture covers 4 x 4 m, tiles get a slight shade jitter so the floor does not read as one sheet.
  const floorTex = (draw: (ctx: CanvasRenderingContext2D, px: number) => void, w: number, d: number) => {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.width = cv.height = 512;
    if (ctx) draw(ctx, 512);
    const tex = T(new THREE.CanvasTexture(cv));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 4, d / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  };
  const shade = (hex: string, amt: number) => '#' + new THREE.Color(hex).offsetHSL(0, 0, amt).getHexString();
  const tiles = (base: string, grout: string, n: number) => (ctx: CanvasRenderingContext2D, px: number) => {
    const t = px / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.025); ctx.fillRect(i * t, j * t, t, t); }
    ctx.strokeStyle = grout;
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, px); ctx.moveTo(0, i * t); ctx.lineTo(px, i * t); ctx.stroke(); }
  };
  const planks = (ctx: CanvasRenderingContext2D, px: number) => {
    const row = px / 16;
    for (let r = 0; r < 16; r++) {
      let x = -Math.random() * px * 0.3;
      while (x < px) {
        const len = px * (0.25 + Math.random() * 0.3);
        ctx.fillStyle = shade('#D9B98E', (Math.random() - 0.5) * 0.06);
        ctx.fillRect(x, r * row, len, row);
        ctx.fillStyle = 'rgba(90,60,30,0.35)';
        ctx.fillRect(x, r * row, 2, row);
        x += len;
      }
      ctx.fillRect(0, r * row, px, 1.5);
    }
  };
  box(world, FW, FY, FD, M('#FFFFFF', { roughness: 0.9, map: floorTex(tiles('#F1F3F1', '#D5DBD7', 4), FW, FD) }), 0, FY / 2, 0, false);
  const floorPatch = (x1: number, z1: number, x2: number, z2: number, tex: THREE.Texture) => {
    const m = new THREE.Mesh(T(new THREE.PlaneGeometry(x2 - x1, z2 - z1)), M('#FFFFFF', { roughness: 0.85, map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, FY + 0.004, (z1 + z2) / 2);
    m.receiveShadow = true;
    world.add(m);
  };
  floorPatch(7.52, -3.9, 13.88, 8.88, floorTex(planks, 6.36, 12.78));
  floorPatch(-7.08, -8.88, 7.08, -5.95, floorTex(tiles('#DDE4E1', '#B9C4BF', 8), 14.16, 2.93));

  const wSide = M('#BE9F74'), wTop = M('#EFE3CF');
  const wMats = [wSide, wSide, wTop, wSide, wSide, wSide];
  // The cutaway walls stop at 1.5 so the top view sees in; in walk mode `uppers` carry them on up to the ceiling.
  // About 4 m at the people's scale: a canteen hall this size with a 3 m ceiling felt like it sat on your head.
  const CEIL = FY + 3.0;
  const walls: number[][] = [], skirting: number[][] = [], uppers: number[][] = [];
  const wall = (x1: number, z1: number, x2: number, z2: number, h = 1.5, t = 0.24) => {
    walls.push([x1, z1, x2, z2, t / 2]);
    const dx = x2 - x1, dz = z2 - z1;
    skirting.push([(x1 + x2) / 2, FY + 0.05, (z1 + z2) / 2, -Math.atan2(dz, dx), Math.hypot(dx, dz) + t, 1, t + 0.03]);
    if (h >= 1.5) uppers.push([(x1 + x2) / 2, (FY + h + CEIL) / 2, (z1 + z2) / 2, -Math.atan2(dz, dx), Math.hypot(dx, dz) + t, CEIL - FY - h, t]);
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
  wall(-10.2, -2.4, -10.2, 0.4, 0.9, 0.18); wall(-10.2, 1.8, -10.2, 3.6, 0.9, 0.18);

  const dummy = new THREE.Object3D();
  // One draw call for every copy of a prop; rows are [x, y, z, rotY?, scaleX?, scaleY?, scaleZ?].
  const many = (geo: THREE.BufferGeometry, mat: THREE.Material, at: number[][], cast = true, colors?: THREE.ColorRepresentation[]) => {
    const m = T(new THREE.InstancedMesh(T(geo), mat, at.length));
    at.forEach(([x, y, z, ry = 0, sx = 1, sy = 1, sz = 1], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colors) m.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    m.castShadow = cast;
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  const mats = {
    w: M('#E9B949', { roughness: 0.6 }), s: M('#2E8B6C', { roughness: 0.6 }), tag: M('#4C5FD5', { roughness: 0.4 }),
    plate: M('#FFFFFF', { roughness: 0.3 }), food: [M('#E39A4B'), M('#D8693E'), M('#C9B25A'), M('#9DBE6A')], cup: M('#7FB7D8', { roughness: 0.2 }),
  };
  const skins = ['#F1D3B5', '#E0B48F', '#C68E64', '#8D5A3B'].map(c => M(c, { roughness: 0.7 }));
  const hairs = ['#2B2522', '#4A3426', '#1C1C1C', '#7A5636', '#B8B0A6'].map(c => M(c));
  const pants = ['#3B4A5C', '#2F3B33', '#5C5248', '#26304A', '#6B7280'].map(c => M(c));
  const hijabs = ['#3E5C76', '#B5838D', '#E5D9C9', '#2F3E46', '#8E7DBE', '#C9A66B'].map(c => M(c, { roughness: 0.9 }));
  const bags = ['#2F3B33', '#7A3B33', '#3B4A5C', '#C9A66B'].map(c => M(c));
  const crewM = { coat: M('#F7F7F5', { roughness: 0.7 }), slacks: M('#2F3B35'), apron: M('#3D4A45'), denim: M('#2F6FB8'), hard: M('#F2C230', { roughness: 0.4 }), teal: M('#5B8A9A') };
  const pick = <X,>(xs: X[]) => xs[Math.floor(Math.random() * xs.length)];

  // Faces, shoes and hands are baked into the limb geometry as vertex colours, so detail adds no draw calls.
  // White vertices take the material colour (skin, pants, sleeve); dark ones stay dark whatever it is.
  const paint = (geo: THREE.BufferGeometry, hex: THREE.ColorRepresentation = '#FFFFFF') => {
    const c = new THREE.Color(hex), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const merge = (...gs: THREE.BufferGeometry[]) => T(mergeGeometries(gs) ?? gs[0]);
  const tinted = new Map<THREE.Material, THREE.Material>();
  const vc = (m: THREE.Material) => { let t = tinted.get(m); if (!t) { t = T(m.clone()); (t as THREE.MeshStandardMaterial).vertexColors = true; tinted.set(m, t); } return t; };
  const EYE_C = '#1E1A18', LIP_C = '#8A4B42';
  const face = (glasses: boolean) => merge(
    paint(new THREE.SphereGeometry(0.11, 16, 12)),
    paint(new THREE.SphereGeometry(0.014, 6, 4).translate(-0.038, 0.016, 0.1), EYE_C),
    paint(new THREE.SphereGeometry(0.014, 6, 4).translate(0.038, 0.016, 0.1), EYE_C),
    paint(new THREE.SphereGeometry(0.018, 6, 4).translate(0, -0.012, 0.108)),
    paint(new THREE.BoxGeometry(0.036, 0.008, 0.01).translate(0, -0.048, 0.1), LIP_C),
    ...(glasses ? [
      paint(new THREE.BoxGeometry(0.13, 0.01, 0.01).translate(0, 0.018, 0.112), EYE_C),
      paint(new THREE.BoxGeometry(0.042, 0.03, 0.006).translate(-0.038, 0.016, 0.112), '#5F6B70'),
      paint(new THREE.BoxGeometry(0.042, 0.03, 0.006).translate(0.038, 0.016, 0.112), '#5F6B70'),
    ] : []),
  );
  const gFace = face(false), gFaceGlasses = face(true);
  const gThigh = T(new THREE.BoxGeometry(0.12, 0.25, 0.14).translate(0, -0.125, 0));
  const gShin = merge(paint(new THREE.BoxGeometry(0.11, 0.25, 0.13).translate(0, -0.125, 0.01)), paint(new THREE.BoxGeometry(0.12, 0.06, 0.2).translate(0, -0.25, 0.035), '#2A2A2A'));
  const gTorso = T(new THREE.CapsuleGeometry(0.15, 0.2, 4, 10).scale(1, 1, 0.66));
  const gUpper = T(new THREE.CapsuleGeometry(0.048, 0.12, 3, 8).translate(0, -0.1, 0));
  const gFore = merge(paint(new THREE.CapsuleGeometry(0.042, 0.12, 3, 8).translate(0, -0.09, 0)), paint(new THREE.SphereGeometry(0.045, 8, 6).translate(0, -0.2, 0.005)));
  // Long sleeves: the cuff takes the (white) coat colour and the hand is painted with the wearer's skin.
  const sleeved = new Map<THREE.Material, THREE.BufferGeometry>();
  const gForeSleeve = (skin: THREE.Material) => {
    let g = sleeved.get(skin);
    if (!g) sleeved.set(skin, g = merge(paint(new THREE.CapsuleGeometry(0.046, 0.12, 3, 8).translate(0, -0.09, 0)), paint(new THREE.SphereGeometry(0.045, 8, 6).translate(0, -0.2, 0.005), (skin as THREE.MeshStandardMaterial).color)));
    return g;
  };
  const cap = () => new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const gHair = {
    short: T(cap()),
    long: merge(cap(), new THREE.CapsuleGeometry(0.075, 0.14, 3, 10).scale(1.3, 1, 0.6).translate(0, -0.07, -0.075)),
    bun: merge(cap(), new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.07, -0.1)),
  };
  // Hijab: a shell open at the face, draped over the shoulders.
  const gHijab = merge(new THREE.SphereGeometry(0.128, 16, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5), new THREE.CylinderGeometry(0.1, 0.165, 0.17, 16).translate(0, -0.15, 0));
  const gChef = T(new THREE.CylinderGeometry(0.12, 0.1, 0.16, 14)), gHard = T(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const gApron = T(new THREE.BoxGeometry(0.24, 0.4, 0.02)), gBag = T(new THREE.BoxGeometry(0.22, 0.27, 0.1));
  const gPhone = merge(paint(new THREE.BoxGeometry(0.05, 0.095, 0.01), '#1B1B1D'), paint(new THREE.BoxGeometry(0.042, 0.082, 0.004).translate(0, 0, 0.006), '#9CCBEA'));
  const phoneM = vc(M('#FFFFFF', { roughness: 0.3, emissive: '#1B2A33', emissiveIntensity: 0.4 }));
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
    knees.forEach(n => part(gShin, vc(k.pants), n, 0, 0, 0));
    const arms = [-0.2, 0.2].map(o => joint(g, o, FY + 0.93)), elbows = arms.map(a => joint(a, 0, -0.2));
    const shirt = [part(gTorso, k.shirt, g, 0, HIP + 0.22, 0, true), ...arms.map(a => part(gUpper, k.shirt, a, 0, 0, 0))];
    elbows.forEach(e => part(k.sleeves ? gForeSleeve(k.skin) : gFore, vc(k.sleeves ? k.shirt : k.skin), e, 0, 0, 0));
    const head = part(k.glasses ? gFaceGlasses : gFace, vc(k.skin), g, 0, HEAD, 0, true);
    if (k.hijab) part(gHijab, k.hijab, head, 0, 0, -0.004);
    else if (k.hair) part(gHair[k.style ?? 'short'], k.hair, head, 0, 0.012, -0.008);
    if (k.hat === 'chef') part(gChef, crewM.coat, head, 0, 0.13, 0);
    if (k.hat === 'hard') part(gHard, k.hatMat ?? crewM.hard, head, 0, 0.02, 0);
    let phone: THREE.Mesh | undefined;
    if (k.phone) { phone = part(gPhone, phoneM, elbows[1], 0, -0.21, 0.045); phone.rotation.x = -0.5; phone.visible = false; }
    if (k.apron) part(gApron, k.apron, g, 0, HIP + 0.17, 0.105);
    if (k.bag) part(gBag, k.bag, g, 0, HIP + 0.27, -0.14);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    parent.add(g);
    return { g, head, hips, knees, arms, elbows, shirt, phone };
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
    f.arms[1].rotation.z = 0;
    f.elbows[0].rotation.x = reach ? -0.35 : -0.15 - Math.max(0, s) * 0.35;
    f.elbows[1].rotation.x = reach ? -0.35 : -0.15 - Math.max(0, -s) * 0.35;
  }
  // Looking at a phone: right forearm up in front of the chest, head tipped down to the screen.
  function texting(f: Fig, on: boolean) {
    if (f.phone) f.phone.visible = on;
    f.head.rotation.x = on ? 0.38 : 0;
    if (!on) return;
    f.arms[1].rotation.x = -0.35;
    f.arms[1].rotation.z = -0.45;
    f.elbows[1].rotation.x = -1.45;
    f.head.rotation.y = 0;
  }
  const customerLook = (): Look => {
    const covered = Math.random() < 0.35;
    return {
      shirt: mats.w, pants: pick(pants), skin: pick(skins),
      ...(covered ? { hijab: pick(hijabs) } : { hair: pick(hairs), style: pick(['short', 'short', 'long', 'bun'] as const) }),
      glasses: Math.random() < 0.2, bag: Math.random() < 0.25 ? pick(bags) : undefined, phone: Math.random() < 0.4,
    };
  };

  const steel = M('#D9E0DD', { roughness: 0.35, metalness: 0.35 }), dark = M('#5E6B66', { roughness: 0.5 });
  const wood = M('#EFE6D8'), seatM = M('#8FB3A4'), crate = M('#C9A26B'), pallet = M('#B08A5A'), leaf = M('#5E9B6A', { roughness: 0.9 }), potM = M('#D9CBB5');
  box(world, 5.2, 0.7, 0.8, steel, -3.6, FY + 0.35, -8.35);
  box(world, 5.2, 0.7, 0.8, steel, 3.6, FY + 0.35, -8.35);
  [-5.4, -3.6, -1.8].forEach(x => box(world, 0.9, 0.04, 0.6, dark, x, FY + 0.72, -8.35));
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), -6.4, FY + 0.95, -6.9);
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), 6.4, FY + 0.95, -6.9);
  box(world, 4.2, 0.7, 0.7, steel, 0, FY + 0.35, -7.0);
  for (let i = 0; i < 3; i++) box(world, 0.9, 0.9, 0.6, M('#DCE4F2'), -13.3, FY + 0.45, -8.4 + i * 1.1);
  // Kitchen: pots and a wok on the burners, a prep board, plate stacks and filled pans on the island.
  many(new THREE.CylinderGeometry(0.17, 0.15, 0.18, 16), dark, [[-5.4, FY + 0.83, -8.35], [-1.8, FY + 0.83, -8.35]]);
  many(new THREE.CylinderGeometry(0.24, 0.1, 0.1, 16), M('#2F3533', { roughness: 0.4, metalness: 0.4 }), [[-3.6, FY + 0.79, -8.35]]);
  box(world, 0.55, 0.03, 0.34, M('#D7B98C'), 3.0, FY + 0.715, -8.35, false);
  many(new THREE.SphereGeometry(0.06, 10, 8), mats.food[3], [[2.85, FY + 0.77, -8.4], [2.97, FY + 0.77, -8.3], [3.1, FY + 0.77, -8.42]], false);
  many(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 18), mats.plate, [[4.9, FY + 0.78, -8.35], [5.4, FY + 0.78, -8.35]]);
  [-1.2, 0, 1.2].forEach((x, i) => box(world, 0.6, 0.07, 0.4, mats.food[i], x, FY + 0.74, -7.0, false));
  // Steam puffs rise off the pots and wok; a flame flickers under the wok.
  const STEAM_FROM: XZ[] = [[-5.4, -8.35], [-3.6, -8.35], [-1.8, -8.35]], PUFFS = 7;
  const steam = T(new THREE.InstancedMesh(T(new THREE.IcosahedronGeometry(0.16, 1)), M('#FFFFFF', { transparent: true, opacity: 0.28, depthWrite: false }), STEAM_FROM.length * PUFFS));
  steam.renderOrder = 5;
  steam.visible = !reduced;
  world.add(steam);
  const flame = new THREE.Mesh(T(new THREE.ConeGeometry(0.14, 0.12, 12)), M('#FF8A2A', { emissive: '#FF6A00', emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
  flame.position.set(-3.6, FY + 0.76, -8.35);
  world.add(flame);
  function puff(t: number) {
    STEAM_FROM.forEach(([x, z], s) => {
      for (let i = 0; i < PUFFS; i++) {
        const life = (t * 0.35 + i / PUFFS + s * 0.13) % 1, k = s * PUFFS + i;
        dummy.position.set(x + Math.sin(k * 1.7 + t * 0.8) * 0.12 * life, FY + 0.95 + life * 1.1, z + Math.cos(k * 2.3) * 0.1 * life);
        dummy.rotation.set(0, k, 0);
        dummy.scale.setScalar(Math.sin(Math.PI * life) * (0.6 + life));
        dummy.updateMatrix();
        steam.setMatrixAt(k, dummy.matrix);
      }
    });
    steam.instanceMatrix.needsUpdate = true;
    flame.scale.set(1, 0.8 + Math.abs(Math.sin(t * 17) * Math.sin(t * 5.3)) * 0.6, 1);
  }

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
  // Zone volumes, outlines and labels read well from above but box the view in first person; floor tints stay.
  const shells: THREE.Object3D[] = [];
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
    shells.push(vol, ed);
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
    shells.push(lab);
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
  zone(-13.85, -5.05, -10.35, 3.45, '#2F7A55', 'Mushola', 0.9);
  zone(9.25, D2 + 0.05, 11.15, D2 + 1.75, '#55635D', 'Keluar', 0.5);
  void document.fonts?.ready.then(() => labelers.forEach(f => f()));

  // ---- Set dressing: skirting, windows, signs and the small things a real canteen has.
  const sign = (lines: string[], w: number, h: number, bg: string, fg: string) => {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.width = Math.round(w * 320);
    cv.height = Math.round(h * 320);
    const tex = T(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const draw = () => {
      if (!ctx) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lh = cv.height / (lines.length + 0.5);
      lines.forEach((t, i) => { ctx.font = `${i ? 600 : 800} ${Math.round(lh * (i ? 0.5 : 0.66))}px ${LABEL_FONT}`; ctx.fillText(t, cv.width / 2, lh * (i + 0.75)); });
      tex.needsUpdate = true;
    };
    draw();
    labelers.push(draw);
    return new THREE.Mesh(T(new THREE.PlaneGeometry(w, h)), M('#FFFFFF', { map: tex, roughness: 0.8 }));
  };
  const hang = (m: THREE.Mesh, x: number, y: number, z: number, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; world.add(m); return m; };
  many(new THREE.BoxGeometry(1, 0.1, 1), M('#8C7458'), skirting, false);
  // Windows: rows are [x, z, rotY]; the glass is thicker than the wall so it shows on both faces.
  const panes = [[H2, -0.75, Math.PI / 2], [H2, 2.55, Math.PI / 2], [H2, 5.6, Math.PI / 2], [H2, -7.2, Math.PI / 2], [11.3, -D2, 0],
    [4.6, -D2, 0], [-11.8, -D2, 0], [1.5, D2, 0], [4.5, D2, 0], [7.4, D2, 0], [-12.2, D2, 0], [-H2, -2.6, Math.PI / 2], [-H2, 0.9, Math.PI / 2]];
  many(new THREE.BoxGeometry(1, 0.64, 1), M('#F4F1EA'), panes.map(([x, z, r]) => [x, FY + 1.0, z, r, 1.5, 1, 0.27]), false);
  many(new THREE.BoxGeometry(1, 0.52, 1), M('#CFE6F2', { roughness: 0.1, metalness: 0.1, emissive: '#9CC7DE', emissiveIntensity: 0.25 }), panes.map(([x, z, r]) => [x, FY + 1.0, z, r, 1.36, 1, 0.3]), false);
  many(new THREE.BoxGeometry(0.04, 0.52, 1), M('#F4F1EA'), panes.map(([x, z, r]) => [x, FY + 1.0, z, r, 1, 1, 0.31]), false);
  // Kitchen: menu board, spice shelf, LPG cylinders, rice cookers and a sink.
  hang(sign(['MENU HARI INI', 'Nasi Ayam Geprek 15K  ·  Soto Ayam 12K  ·  Nasi Goreng 14K', 'Gado-gado 12K  ·  Es Teh 4K  ·  Es Jeruk 6K'], 2.6, 0.52, '#24332D', '#F4EBD8'), 0, FY + 1.16, -D2 + 0.125);
  box(world, 4.4, 0.04, 0.24, wood, -3.8, FY + 1.16, -8.74, false);
  const jars = Array.from({ length: 14 }, (_, i) => [-5.8 + i * 0.3, FY + 1.25, -8.74]);
  [M('#B8352B', { roughness: 0.3 }), M('#D9A53B', { roughness: 0.3 }), M('#6B4A2E', { roughness: 0.3 })].forEach((m, k) =>
    many(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), m, jars.filter((_, i) => i % 3 === k), false));
  many(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 16), M('#3F8F4A', { roughness: 0.5 }), [[-6.62, FY + 0.21, -8.55], [-6.62, FY + 0.21, -8.18]]);
  many(new THREE.CylinderGeometry(0.17, 0.16, 0.2, 18), mats.plate, [[1.45, FY + 0.8, -8.35], [2.05, FY + 0.8, -8.35]]);
  many(new THREE.SphereGeometry(0.17, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), M('#C9CFCC', { roughness: 0.3 }), [[1.45, FY + 0.9, -8.35], [2.05, FY + 0.9, -8.35]], false);
  box(world, 0.62, 0.02, 0.46, M('#9AA5A1', { roughness: 0.2, metalness: 0.6 }), 4.15, FY + 0.712, -8.35, false);
  box(world, 0.04, 0.3, 0.04, steel, 4.15, FY + 0.85, -8.62, false);
  // Counter line: a tray and cutlery station where customers pick up before the counters.
  box(world, 0.7, 0.7, 0.5, wood, 6.7, FY + 0.35, -4.4);
  many(new THREE.BoxGeometry(0.46, 0.022, 0.34), M('#C46A3A', { roughness: 0.5 }), Array.from({ length: 6 }, (_, i) => [6.55, FY + 0.72 + i * 0.024, -4.4]), false);
  many(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 12), steel, [[6.92, FY + 0.78, -4.3]], false);
  // Dining: sambal, kecap and tissues on every table, a tray-return rack, a clock, posters, AC units.
  const tablesAt = [9.3, 12.3].flatMap(tx => [-2.4, 0.9, 4.2, 7.0].map(tz => [tx, tz]));
  many(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 10), M('#C0392B', { roughness: 0.3 }), tablesAt.map(([x, z]) => [x - 0.16, FY + 0.685, z + 0.06]), false);
  many(new THREE.CylinderGeometry(0.032, 0.032, 0.15, 10), M('#2B1D16', { roughness: 0.3 }), tablesAt.map(([x, z]) => [x - 0.24, FY + 0.695, z - 0.04]), false);
  many(new THREE.BoxGeometry(0.12, 0.07, 0.07), M('#FAFAF7'), tablesAt.map(([x, z]) => [x + 0.22, FY + 0.655, z]), false);
  box(world, 0.46, 1.1, 0.56, dark, 13.5, FY + 0.55, -0.75);
  many(new THREE.BoxGeometry(0.4, 0.02, 0.5), M('#C46A3A', { roughness: 0.5 }), Array.from({ length: 5 }, (_, i) => [13.46, FY + 0.25 + i * 0.18, -0.75]), false);
  const clock = hang(new THREE.Mesh(T(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 28)), M('#FAFAF7')), 8.8, FY + 1.12, -5.06);
  clock.rotation.x = Math.PI / 2;
  box(world, 0.02, 0.13, 0.02, dark, 8.8, FY + 1.17, -5.03, false).rotation.z = 0.5;
  box(world, 0.02, 0.17, 0.02, dark, 8.84, FY + 1.1, -5.03, false).rotation.z = -1.9;
  hang(sign(['JAGA KEBERSIHAN', 'Kembalikan nampan ke rak'], 0.9, 0.6, '#2E8B6C', '#FFFFFF'), H2 - 0.13, FY + 0.95, 4.1, -Math.PI / 2);
  hang(sign(['CUCI TANGAN', 'sebelum dan sesudah makan'], 0.9, 0.6, '#3D7A96', '#FFFFFF'), H2 - 0.13, FY + 0.95, -2.4, -Math.PI / 2);
  many(new THREE.BoxGeometry(0.24, 0.26, 0.85), M('#F7F8F7', { roughness: 0.4 }), [[H2 - 0.25, FY + 1.33, 7.2], [H2 - 0.25, FY + 1.33, 0.9]]);
  many(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 12), M('#D0312D', { roughness: 0.35 }), [[-9.95, FY + 0.3, -4.95], [6.95, FY + 0.3, -6.1], [13.6, FY + 0.3, 7.95]]);
  // Entrance and outside: sanitizer stand, pavement, trees and a bench.
  box(world, 0.05, 1.0, 0.05, steel, -6.15, FY + 0.5, 7.7);
  box(world, 0.1, 0.16, 0.08, M('#E8F1EE'), -6.15, FY + 1.05, 7.7);
  const pave = new THREE.Mesh(T(new THREE.PlaneGeometry(FW + 6, 2.6)), M('#E4E2DC', { roughness: 0.95, map: floorTex(tiles('#E4E2DC', '#CFCBC2', 4), FW + 6, 2.6) }));
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0.012, D2 + 1.45);
  pave.receiveShadow = true;
  world.add(pave);
  const trees = [[-9.2, D2 + 3.6], [1.6, D2 + 3.4], [6.8, D2 + 3.7], [-H2 - 1.6, 4.2], [H2 + 1.7, -3.0], [H2 + 1.6, 6.0]];
  many(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 8), M('#7A5A3C'), trees.map(([x, z]) => [x, 0.55, z]));
  many(new THREE.IcosahedronGeometry(0.75, 1), leaf, trees.map(([x, z], i) => [x, 1.55, z, i, 1, 0.9 + (i % 3) * 0.1, 1]));
  box(world, 1.4, 0.06, 0.4, wood, 0.6, 0.45, D2 + 1.6);
  many(new THREE.BoxGeometry(0.06, 0.42, 0.36), dark, [[0.05, 0.21, D2 + 1.6], [1.15, 0.21, D2 + 1.6]], false);
  // Shop sign on two posts over the entrance.
  many(new THREE.BoxGeometry(0.08, 2.0, 0.08), dark, [[-6.75, 1.0, D2 + 0.35], [-2.25, 1.0, D2 + 0.35]]);
  hang(sign(['KANTIN', 'Buka 10.00 – 15.00  ·  Halal'], 4.6, 0.62, '#1F4D3E', '#F7EFD9'), -4.5, 1.92, D2 + 0.4);
  // Parked motorbikes on the pavement: rows are [x, z, yaw]; each part is placed in the bike's own frame.
  const bikes = [[2.6, D2 + 1.9, 0.35], [3.4, D2 + 1.9, 0.35], [4.2, D2 + 1.9, 0.35], [5.0, D2 + 1.9, 0.35], [6.6, D2 + 1.95, 0.35]];
  const onBike = (dx: number, y: number, dz: number) => bikes.map(([x, z, r]) => [x + Math.cos(r) * dx + Math.sin(r) * dz, y, z - Math.sin(r) * dx + Math.cos(r) * dz, r]);
  many(new THREE.TorusGeometry(0.16, 0.05, 8, 18).rotateY(Math.PI / 2), M('#1F1F1F', { roughness: 0.8 }), [...onBike(0, 0.21, 0.42), ...onBike(0, 0.21, -0.42)]);
  many(new THREE.BoxGeometry(0.24, 0.24, 0.72), M('#FFFFFF', { roughness: 0.35 }), onBike(0, 0.4, 0), true, ['#C0392B', '#1F3A5F', '#F2F2F2', '#2B2B2B', '#3F8F4A']);
  many(new THREE.BoxGeometry(0.21, 0.07, 0.42), M('#1E1E1E', { roughness: 0.7 }), onBike(0, 0.56, -0.12), false);
  many(new THREE.BoxGeometry(0.05, 0.36, 0.05), dark, onBike(0, 0.55, 0.36), false);
  many(new THREE.BoxGeometry(0.52, 0.04, 0.04), dark, onBike(0, 0.74, 0.36), false);
  // Dining: a water dispenser with a gallon bottle, and a TV whose picture is redrawn a few times a second.
  box(world, 0.34, 0.9, 0.34, M('#F4F6F5', { roughness: 0.4 }), 13.55, FY + 0.45, 1.45);
  many(new THREE.CylinderGeometry(0.14, 0.14, 0.36, 16), M('#7FB7E0', { transparent: true, opacity: 0.6, roughness: 0.05 }), [[13.55, FY + 1.08, 1.45]], false);
  box(world, 0.96, 0.58, 0.05, M('#1A1A1A', { roughness: 0.4 }), 9.9, FY + 1.02, -5.07);
  const tvCv = document.createElement('canvas'), tvCtx = tvCv.getContext('2d');
  tvCv.width = 320;
  tvCv.height = 176;
  const tvTex = T(new THREE.CanvasTexture(tvCv));
  tvTex.colorSpace = THREE.SRGBColorSpace;
  hang(new THREE.Mesh(T(new THREE.PlaneGeometry(0.88, 0.5)), M('#000000', { emissive: '#FFFFFF', emissiveMap: tvTex, roughness: 0.3 })), 9.9, FY + 1.02, -5.04);
  let tvAt = -1;
  function drawTv(t: number) {
    if (!tvCtx || (tvAt >= 0 && t - tvAt < 0.25)) return;
    tvAt = t;
    const g = tvCtx.createLinearGradient(0, 0, 320, 176);
    g.addColorStop(0, `hsl(${(t * 8) % 360} 45% 32%)`);
    g.addColorStop(1, `hsl(${(t * 8 + 60) % 360} 50% 18%)`);
    tvCtx.fillStyle = g;
    tvCtx.fillRect(0, 0, 320, 176);
    tvCtx.fillStyle = '#F4EBD8';
    tvCtx.font = `800 26px ${LABEL_FONT}`;
    tvCtx.fillText('BERITA SIANG', 18, 46);
    tvCtx.font = `500 15px ${LABEL_FONT}`;
    tvCtx.fillText('Cuaca cerah berawan, 31°C', 18, 74);
    tvCtx.fillStyle = 'rgba(0,0,0,0.55)';
    tvCtx.fillRect(0, 140, 320, 36);
    tvCtx.fillStyle = '#FFD166';
    tvCtx.font = `600 15px ${LABEL_FONT}`;
    const ticker = 'Harga cabai turun  ·  Jalan protokol ramai lancar  ·  Liga lokal malam ini pukul 19.00  ·  ';
    const w = tvCtx.measureText(ticker).width, x = -((t * 40) % w);
    tvCtx.fillText(ticker + ticker, x, 164);
    tvTex.needsUpdate = true;
  }
  drawTv(0);
  // Mushola: carpet, two rows of prayer mats facing west (roughly the qibla from Indonesia), a mihrab niche, prayer times,
  // a cabinet of mukena and sarung, and a shoe rack outside the doorway. The wash area next door doubles as the wudhu place.
  floorPatch(-13.88, -5.08, -10.29, 3.48, floorTex(tiles('#2F6B50', '#2A5F47', 8), 3.59, 8.56));
  const drawn = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.width = w;
    cv.height = h;
    if (ctx) paint(ctx, w, h);
    const tex = T(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  };
  const arch = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + w * 0.6);
    ctx.quadraticCurveTo(x, y, x + w / 2, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.6);
    ctx.lineTo(x + w, y + h);
  };
  // Mat pattern in greys: the instance colour tints it, the arch end points west (u = 0).
  const matTex = drawn(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#D8D8D8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.save();
    ctx.translate(24, h / 2);
    ctx.rotate(-Math.PI / 2);
    arch(ctx, -38, 0, 76, 120);
    ctx.restore();
    ctx.fillStyle = '#9A9A9A';
    ctx.fill();
    ctx.fillStyle = '#B8B8B8';
    for (let i = 0; i < 5; i++) ctx.fillRect(160 + i * 16, 22, 6, h - 44);
  });
  const matZ = Array.from({ length: 9 }, (_, i) => -3.75 + i * 0.65);
  many(new THREE.BoxGeometry(1.0, 0.012, 0.55), M('#FFFFFF', { roughness: 0.95, map: matTex }),
    [[-13.35, FY + 0.01, -0.85], ...[-12.15, -11.0].flatMap(x => matZ.map(z => [x, FY + 0.01, z]))], false,
    ['#8E2B2B', '#2D6A4F', '#1F3A5F', '#7A4E2D', '#5B2A6E', '#2E5E6E']);
  const mihrab = drawn(256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#E9E1CC';
    ctx.fillRect(0, 0, w, h);
    arch(ctx, 22, 20, w - 44, h - 20);
    ctx.fillStyle = '#C9A24A';
    ctx.fill();
    arch(ctx, 40, 40, w - 80, h - 40);
    ctx.fillStyle = '#245C45';
    ctx.fill();
    ctx.strokeStyle = 'rgba(233,225,204,0.35)';
    ctx.lineWidth = 2;
    for (let y = 120; y < h; y += 28) for (let x = 52 + ((y / 28) % 2) * 14; x < w - 52; x += 28) { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
  });
  hang(new THREE.Mesh(T(new THREE.PlaneGeometry(0.9, 1.35)), M('#FFFFFF', { map: mihrab, roughness: 0.8 })), -H2 + 0.13, FY + 0.69, -0.85, Math.PI / 2);
  hang(sign(['JADWAL SHOLAT', 'Dzuhur 11.52  ·  Ashar 15.13', 'Maghrib 17.48  ·  Isya 18.59'], 0.95, 0.62, '#245C45', '#F4EBD8'), -H2 + 0.13, FY + 1.0, 2.5, Math.PI / 2);
  box(world, 2.0, 0.9, 0.4, wood, -12.1, FY + 0.45, -4.85);
  many(new THREE.BoxGeometry(0.3, 0.07, 0.3), M('#FFFFFF', { roughness: 0.95 }),
    Array.from({ length: 12 }, (_, i) => [-12.85 + (i % 6) * 0.3, FY + 0.94 + Math.floor(i / 6) * 0.075, -4.85]), false,
    ['#F4F1EA', '#E9E1CC', '#3F5E8C', '#7A3B33', '#F4F1EA', '#2D6A4F']);
  box(world, 0.3, 0.44, 0.9, wood, -9.95, FY + 0.22, -0.3);
  many(new THREE.BoxGeometry(0.22, 0.06, 0.09), M('#FFFFFF', { roughness: 0.7 }),
    Array.from({ length: 8 }, (_, i) => [-9.95, FY + 0.47, -0.66 + i * 0.105]), false, ['#2A2A2A', '#2A2A2A', '#7A5636', '#7A5636', '#3B4A5C', '#3B4A5C', '#C0392B', '#C0392B']);

  // Overhead, seen only from inside (walk mode): ceiling with light panels faces down, so the top view culls it;
  // the kitchen hood and dining fans would clutter the top view, so they show only while walking.
  const ceiling = new THREE.Mesh(T(new THREE.PlaneGeometry(FW, FD).rotateX(Math.PI / 2)), M('#F2F0EB', { roughness: 0.95, emissive: '#E8E4DC', emissiveIntensity: 0.75 }));
  ceiling.position.y = CEIL;
  world.add(ceiling);
  const panels: number[][] = [];
  for (let x = -12; x <= 12; x += 3) for (let z = -7.5; z <= 7.5; z += 3) panels.push([x, CEIL - 0.005, z]);
  many(new THREE.PlaneGeometry(0.7, 0.7).rotateX(Math.PI / 2), M('#FFFFFF', { emissive: '#FFF7E6', emissiveIntensity: 0.9 }), panels, false);
  const walkOnly: THREE.Object3D[] = [];
  walkOnly.push(box(world, 4.8, 0.3, 0.75, steel, -3.6, FY + 1.45, -8.48, false), box(world, 0.6, CEIL - FY - 1.6, 0.4, steel, -3.6, (FY + 1.6 + CEIL) / 2, -8.6, false));
  walkOnly.push(many(new THREE.BoxGeometry(1, 1, 1), wSide, uppers, false));
  const gBlades = merge(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), ...[0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.56, 0.012, 0.09).translate(0.33, 0, 0).rotateY(i * Math.PI / 2)));
  const fans = [[10.8, -0.75], [10.8, 2.55], [10.8, 5.6]].map(([x, z]) => {
    walkOnly.push(box(world, 0.03, 0.8, 0.03, dark, x, CEIL - 0.4, z, false));
    const fan = new THREE.Mesh(gBlades, M('#F4F2EE', { roughness: 0.6 }));
    fan.position.set(x, CEIL - 0.82, z);
    world.add(fan);
    walkOnly.push(fan);
    return fan;
  });
  walkOnly.forEach(o => { o.visible = false; });

  let C = 0, counters = new THREE.Group(), xs: number[] = [], cLabels: CounterLabel[] = [];
  world.add(counters);
  const glass = M('#FFFFFF', { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false });
  const ringGeo = T(new THREE.RingGeometry(0.32, 0.4, 32));
  const ringMat = T(new THREE.MeshBasicMaterial({ color: '#2E8B6C', transparent: true, opacity: 0.35 }));
  const counterTrash: { dispose(): void }[] = [];
  const N = (p: XZ, o: Omit<Node, 'v'> = {}): Node => ({ v: new THREE.Vector3(p[0], 0, p[1]), ...o });
  const kitchen = (): Look => ({ shirt: crewM.coat, sleeves: true, pants: crewM.slacks, skin: pick(skins), hat: 'chef', apron: crewM.apron });
  const staff = (k: Look, route: Node[], extra: Partial<Crew> = {}, parent: THREE.Object3D = world): Crew => {
    const { x, z } = route[0].v;
    return { f: person(parent, k, x, z, route[0].face ?? 0), route, i: 0, wait: 0, ph: Math.random() * 6, ...extra };
  };
  let servers: Crew[] = [];
  const crew: Crew[] = [
    staff(kitchen(), [N([-3.6, -7.7], { face: Math.PI, wait: Infinity })], { busy: true }),
    staff(kitchen(), [N([3.0, -7.7], { face: Math.PI, wait: Infinity })], { busy: true }),
    staff(kitchen(), [N([0, -7.66], { face: 0, wait: Infinity })], { busy: true }),
    staff({ shirt: crewM.coat, sleeves: true, pants: pick(pants), skin: pick(skins), hair: pick(hairs), glasses: true }, [N([11.6, -7.35], { face: 0, wait: Infinity })], { busy: false, seated: true }),
  ];
  {
    // Store hand: picks a crate off the shelves, carries it to the kitchen fridge, comes back.
    const lane = N([-12.4, -5.6]), door = N([-6.8, -5.6]);
    const w = staff({ shirt: crewM.coat, sleeves: true, pants: crewM.denim, apron: crewM.denim, skin: pick(skins), hat: 'hard' }, [
      N([-12.4, -7.3], { face: -Math.PI / 2, wait: 3 }), N([-12.4, -7.3], { fn: () => { w.load!.visible = true; } }), lane, door,
      N([-6.55, -6.3], { face: Math.PI, wait: 2.5, fn: () => { w.load!.visible = false; } }), door, lane,
    ]);
    w.load = box(w.f.g, 0.36, 0.3, 0.3, crate, 0, FY + 0.78, 0.32);
    w.load.visible = false;
    // Cleaner mops the dining corridor in stops.
    const c = staff({ shirt: crewM.teal, pants: crewM.slacks, skin: pick(skins), hijab: hijabs[3] },
      [N([10.8, -3.0], { wait: 4 }), N([10.8, 2.55], { wait: 4 }), N([10.8, 8.0], { wait: 4 }), N([10.8, 2.55], { wait: 3 })]);
    c.tool = new THREE.Group();
    c.tool.position.set(0.1, FY, 0.42);
    box(c.tool, 0.03, 0.95, 0.03, dark, 0, 0.45, -0.15, false).rotation.x = -0.35;
    box(c.tool, 0.36, 0.05, 0.14, crewM.teal, 0, 0.03, 0, false);
    c.f.g.add(c.tool);
    // A ride-hailing driver waits by the bikes outside, on the phone.
    const ojol = staff({ shirt: M('#1F9D55', { roughness: 0.7 }), pants: crewM.slacks, skin: pick(skins), hat: 'hard', hatMat: M('#1F9D55', { roughness: 0.4 }), phone: true },
      [N([1.9, D2 + 2.35], { face: -2.6, wait: Infinity })], { busy: false, texting: true });
    crew.push(w, c, ojol);
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
    const f = person(world, customerLook(), -4.5 + j, D2 + 1.4, Math.PI);
    f.g.scale.set(0.92 + Math.random() * 0.18, 0.94 + Math.random() * 0.12, 0.92 + Math.random() * 0.18);
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
    shot('register', a.f.g.position.x, -5.1);
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
    shot('tray', ch.x, ch.tz);
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

  // Real recordings placed in the room: walk to the kitchen and the sizzle gets louder. Loops start at a random point so
  // reloads do not sound identical; a clip whose file is missing simply stays silent.
  type Clip = 'sizzle' | 'kitchen' | 'crowd' | 'footsteps' | 'tray' | 'register';
  // [clip, x, z, refDistance, volume, seconds]: seconds is the loop file's audible length (see public/audio/CREDITS.md).
  const LOOPS: [Clip, number, number, number, number, number][] = [
    ['sizzle', -3.6, -8.35, 1.6, 0.8, 34.0067], ['kitchen', 0, -7.4, 3, 0.6, 88.0013], ['crowd', 10.8, 2.5, 4, 0, 66], ['footsteps', 0, 1.0, 4, 0, 80],
  ];
  // LAME files start with 576 samples of encoder delay. Chromium strips it (and the end padding) from the LAME header;
  // WebKit keeps both, which would click once per loop, so loop exactly the audible window wherever the decoder put it.
  const LAME_DELAY = 576 / 44100;
  let listener: THREE.AudioListener | null = null, soundOn = false, lastShot = 0;
  const loops = new Map<Clip, THREE.PositionalAudio>(), shots: THREE.PositionalAudio[] = [], buffers = new Map<Clip, AudioBuffer>();
  const level = { crowd: 0, footsteps: 0 };
  function startAudio() {
    const ear = listener = new THREE.AudioListener();
    scene.add(ear);
    const loader = new THREE.AudioLoader();
    LOOPS.forEach(([clip, x, z, ref, vol]) => {
      const a = new THREE.PositionalAudio(ear);
      a.position.set(x, FY + 1, z);
      a.setRefDistance(ref);
      a.setLoop(true);
      a.setVolume(vol);
      scene.add(a);
      loops.set(clip, a);
    });
    for (let i = 0; i < 4; i++) { const a = new THREE.PositionalAudio(ear); a.setRefDistance(1.5); scene.add(a); shots.push(a); }
    (['sizzle', 'kitchen', 'crowd', 'footsteps', 'tray', 'register'] as Clip[]).forEach(clip => {
      loader.loadAsync(`${import.meta.env.BASE_URL}audio/${clip}.mp3`).then(buf => {
        if (listener !== ear) return;
        buffers.set(clip, buf);
        const a = loops.get(clip);
        const secs = LOOPS.find(l => l[0] === clip)?.[5];
        if (a && secs) {
          const start = buf.duration - secs > 0.02 ? LAME_DELAY : 0;
          a.setBuffer(buf);
          a.setLoopStart(start);
          a.setLoopEnd(start + secs);
          a.offset = start + Math.random() * secs;
          a.play();
        }
      }).catch(() => {});
    });
  }
  function setSound(on: boolean) {
    soundOn = on;
    if (on && !listener) startAudio();
    if (listener) void (on && !document.hidden ? listener.context.resume() : listener.context.suspend());
  }
  function shot(clip: Clip, x: number, z: number) {
    const buf = buffers.get(clip), now = performance.now();
    if (!soundOn || !buf || now - lastShot < 90) return;
    lastShot = now;
    const a = shots.find(s => !s.isPlaying) ?? shots[0];
    if (a.isPlaying) a.stop();
    a.setBuffer(buf);
    a.position.set(x, FY + 0.9, z);
    a.setVolume(0.5 + Math.random() * 0.35);
    a.setPlaybackRate(0.92 + Math.random() * 0.16);
    a.play();
  }
  const onVisibility = () => { if (soundOn) setSound(true); };
  document.addEventListener('visibilitychange', onVisibility);

  let last: SceneView | null = null;
  function update(view: SceneView) {
    last = view;
    speedMul = view.speed === 1 ? 2.4 : view.speed === 5 ? 1.4 : 1;
    if (view.c !== C) { clearAll(); buildCounters(view.c); }
    if (view.sound !== soundOn) setSound(view.sound);
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
    if (walking) return;
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
    // Mouse look needs pointer lock; where it is refused (embedded frames, touch), dragging looks around instead.
    if (walking && e.pointerType === 'mouse' && document.pointerLockElement !== cvs) {
      try { void cvs.requestPointerLock()?.catch(() => {}); } catch { /* unsupported */ }
    }
  });
  cvs.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && pinchD) {
      const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      wz = clampZ(baseZoom() * wz * d / pinchD) / baseZoom();
      pinchD = d;
      return;
    }
    if (walking && document.pointerLockElement === cvs) { look(e.movementX * 0.0025, e.movementY * 0.0025); return; }
    if (!ptr.on) return;
    if (walking) look((e.clientX - ptr.x) * 0.005, (e.clientY - ptr.y) * 0.005);
    else {
      dAz -= (e.clientX - ptr.x) * 0.007;
      dPol = Math.max(-0.5, Math.min(0.32, dPol - (e.clientY - ptr.y) * 0.005));
    }
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
  cvs.addEventListener('dblclick', () => { if (!walking) { dAz = 0; dPol = 0; wz = 1; tgt.set(0.4, 0, 1.4); } });
  // First person: eye at NPC head height, starting outside the entrance and facing in.
  const EYE = FY + 1.08, BODY = 0.28, SPAWN: XZ = [-4.5, D2 + 1.2];
  const eye = new THREE.Vector3(SPAWN[0], 0, SPAWN[1]);
  let walking = false, yaw = Math.PI, pitch = -0.05, stride = 0;
  const look = (dx: number, dy: number) => { yaw -= dx; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy)); };
  // Push the eye out of every wall it overlaps; furniture and people are walked through.
  const collide = () => {
    for (const [x1, z1, x2, z2, half] of walls) {
      const dx = x2 - x1, dz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((eye.x - x1) * dx + (eye.z - z1) * dz) / (dx * dx + dz * dz)));
      const ex = eye.x - (x1 + dx * t), ez = eye.z - (z1 + dz * t), d = Math.hypot(ex, ez), min = BODY + half;
      if (d < min && d > 1e-6) { eye.x += ex / d * (min - d); eye.z += ez / d * (min - d); }
    }
    eye.x = Math.max(-H2 - 3, Math.min(H2 + 3, eye.x));
    eye.z = Math.max(-D2 - 3, Math.min(D2 + 4, eye.z));
  };
  function setWalking(on: boolean) {
    walking = on;
    if (on) { eye.set(SPAWN[0], 0, SPAWN[1]); yaw = Math.PI; pitch = -0.05; }
    else if (document.pointerLockElement === cvs) document.exitPointerLock();
    shells.forEach(m => { m.visible = !on; });
    walkOnly.forEach(m => { m.visible = on; });
    camera.fov = on ? 60 : 30;
    camera.near = on ? 0.05 : 0.5;
    camera.updateProjectionMatrix();
  }
  // WASD / arrows walk the camera over the floor and Q/E turn it, while the scene is hovered or fullscreen.
  const MOVE: Record<string, XZ> = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const held = new Set<string>();
  let hover = false, fast = false;
  const keyDown = (e: KeyboardEvent) => {
    fast = e.shiftKey;
    if (!(e.code in MOVE || e.code === 'KeyQ' || e.code === 'KeyE') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!hover && !document.fullscreenElement?.contains(host) && document.pointerLockElement !== cvs) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="slider"], [role="tab"], dialog')) return;
    e.preventDefault();
    held.add(e.code);
  };
  const keyUp = (e: KeyboardEvent) => { fast = e.shiftKey; held.delete(e.code); };
  const dropKeys = () => held.clear();
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  window.addEventListener('blur', dropKeys);
  cvs.addEventListener('pointerenter', () => { hover = true; });
  cvs.addEventListener('pointerleave', () => { hover = false; });

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
  // People standing still look around now and then: a slow sway that rests near straight ahead most of the time.
  const glance = (now: number, ph: number) => { const t = now * 0.00045 + ph * 4; return Math.sin(t) ** 3 * 0.55 + Math.sin(t * 2.7) * 0.06; };
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
    w.f.head.rotation.y = walk == null && !working && !reduced ? glance(performance.now(), w.ph) : 0;
    if (w.texting) texting(w.f, true);
    if (w.tool) w.tool.rotation.y = working ? wob * 0.5 : 0;
    w.f.g.position.y = w.seated ? SEAT_DROP : walk == null || reduced ? 0 : Math.abs(Math.sin(walk)) * 0.03;
    return walk != null;
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
    if (last && last.resetNonce !== nonce) { if (nonce !== null) { dAz = 0; dPol = 0; wz = 1; tgt.set(0.4, 0, 1.4); } nonce = last.resetNonce; }
    if (!!last?.walk !== walking) setWalking(!!last?.walk);
    let mx = 0, mz = 0;
    held.forEach(code => { const m = MOVE[code]; if (m) { mx += m[0]; mz += m[1]; } });
    if (walking) {
      const sp = (fast ? 4.5 : 2.2) * dt, sy = Math.sin(yaw), cy = Math.cos(yaw);
      if (held.has('KeyQ')) yaw += 1.6 * dt;
      if (held.has('KeyE')) yaw -= 1.6 * dt;
      eye.x += (mz * sy - mx * cy) * sp;
      eye.z += (mz * cy + mx * sy) * sp;
      collide();
      stride = mx || mz ? stride + dt * (fast ? 14 : 10) : 0;
      camera.position.set(eye.x, EYE + (reduced ? 0 : Math.abs(Math.sin(stride)) * 0.025), eye.z);
      tmp.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).add(camera.position);
      camera.lookAt(tmp);
    } else if (held.size) {
      const sp = cur.r * (fast ? 1.1 : 0.45) * dt, sa = Math.sin(cur.az), ca = Math.cos(cur.az);
      tgt.x = Math.max(-H2, Math.min(H2, tgt.x + (mx * ca - mz * sa) * sp));
      tgt.z = Math.max(-D2, Math.min(D2 + 2, tgt.z - (mx * sa + mz * ca) * sp));
      if (held.has('KeyQ')) dAz += 1.6 * dt;
      if (held.has('KeyE')) dAz -= 1.6 * dt;
    }
    const az = ((last?.rot ?? 0) * Math.PI) / 180;
    const zoom = clampZ(baseZoom() * wz), asp = camera.aspect || 1.7;
    const want = { az: -0.62 + az + dAz, pol: 0.9 + dPol, r: 44 / zoom * Math.max(1, 1.55 / asp) };
    const k = reduced ? 1 : 1 - Math.pow(0.001, dt);
    cur.az += (want.az - cur.az) * k;
    cur.pol += (want.pol - cur.pol) * k;
    cur.r += (want.r - cur.r) * k;
    if (!walking) {
      camera.position.set(tgt.x + cur.r * Math.sin(cur.pol) * Math.sin(cur.az), cur.r * Math.cos(cur.pol), tgt.z + cur.r * Math.sin(cur.pol) * Math.cos(cur.az));
      camera.lookAt(tgt);
    }
    let walkers = 0;
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
        a.f.arms[1].rotation.x = -0.7 - nod * 0.5;
        a.f.elbows[1].rotation.x = -0.9 - nod * 0.9;
        a.f.head.position.y = HEAD - nod * 0.03;
        // Between bites they chat: turn to a neighbour and now and then gesture with the free hand.
        texting(a.f, false);
        a.f.head.rotation.y = reduced ? 0 : glance(now * 1.6, a.ph) * 1.4;
        if (!reduced && Math.sin(now * 0.0021 + a.ph * 7) > 0.8) { a.f.arms[0].rotation.x = -0.55; a.f.elbows[0].rotation.x = -0.9 + Math.sin(now * 0.012) * 0.25; }
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
      a.f.head.rotation.y = walk == null && !reduced ? glance(now, a.ph) : 0;
      texting(a.f, !!a.f.phone && a.stage === 'queue' && !a.tray);
      if (walk != null) walkers++;
    });
    crew.forEach(w => { if (tick(w, dt)) walkers++; });
    servers.forEach(w => tick(w, dt));
    if (!reduced) { puff(now / 1000); drawTv(now / 1000); }
    if (walking && !reduced) fans.forEach(f => { f.rotation.y += dt * 7; });
    if (listener) {
      // The ear rides with the eye in walk mode; from above it sits a quarter of the way to the camera, so zooming in brings the room closer.
      if (walking) listener.position.copy(camera.position); else listener.position.lerpVectors(tgt, camera.position, 0.25);
      listener.quaternion.copy(camera.quaternion);
      const ease = Math.min(1, dt * 1.5);
      level.crowd += (0.2 + 0.8 * chairs.filter(c => c.busy).length / chairs.length - level.crowd) * ease;
      level.footsteps += (Math.min(1, walkers / 8) - level.footsteps) * ease;
      loops.get('crowd')?.setVolume(level.crowd);
      loops.get('footsteps')?.setVolume(level.footsteps * 0.7);
    }
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
      document.removeEventListener('visibilitychange', onVisibility);
      [...loops.values(), ...shots].forEach(a => { if (a.isPlaying) a.stop(); });
      if (listener) { scene.remove(listener); void listener.context.suspend(); listener = null; }
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', dropKeys);
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
