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
type Agent = {
  g: THREE.Group; b: THREE.Mesh; h: THREE.Mesh; path: Node[]; laneEnd: number;
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

  const steel = M('#D9E0DD', { roughness: 0.35, metalness: 0.35 }), dark = M('#5E6B66', { roughness: 0.5 });
  box(world, 5.2, 0.9, 0.8, steel, -3.6, FY + 0.45, -8.35);
  box(world, 5.2, 0.9, 0.8, steel, 3.6, FY + 0.45, -8.35);
  [-5.4, -3.6, -1.8].forEach(x => box(world, 0.9, 0.04, 0.6, dark, x, FY + 0.92, -8.35));
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), -6.4, FY + 0.95, -6.9);
  box(world, 1.0, 1.9, 0.8, M('#E6ECEA', { roughness: 0.4 }), 6.4, FY + 0.95, -6.9);
  box(world, 4.2, 0.9, 0.7, steel, 0, FY + 0.45, -7.0);
  for (let i = 0; i < 3; i++) box(world, 0.9, 0.9, 0.6, M('#DCE4F2'), -13.3, FY + 0.45, -8.4 + i * 1.1);
  box(world, 0.6, 0.85, 3.2, M('#E4EBE8'), -13.5, FY + 0.43, -0.4);

  const wood = M('#EFE6D8'), seatM = M('#8FB3A4');
  const chairs: Chair[] = [], AISLE = [-3.65, -0.75, 2.55, 5.6, 8.45];
  [9.3, 12.3].forEach(tx => [-2.4, 0.9, 4.2, 7.0].forEach((tz, r) => {
    box(world, 1.9, 0.08, 1.0, wood, tx, FY + 0.76, tz);
    box(world, 0.12, 0.72, 0.12, dark, tx, FY + 0.36, tz, false);
    [-0.5, 0.5].forEach(o => [-1, 1].forEach(s => {
      box(world, 0.44, 0.44, 0.44, seatM, tx + o, FY + 0.22, tz + s * 0.8);
      chairs.push({ x: tx + o, z: tz + s * 0.76, tz, s, aisle: s < 0 ? AISLE[r] : AISLE[r + 1], busy: false });
    }));
  }));

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
    xs.forEach((x, i) => {
      const body = own(new THREE.MeshStandardMaterial({ color: '#F3F6F4', roughness: 0.6 }));
      const strip = own(new THREE.MeshStandardMaterial({ color: '#B9C6BF', emissive: '#000000', roughness: 0.4 }));
      cbox(cw, 1.0, 0.9, body, x, FY + 0.5, -5.45);
      cbox(cw + 0.12, 0.07, 1.05, top, x, FY + 1.03, -5.45);
      cbox(cw * 0.92, 0.07, 0.05, strip, x, FY + 0.88, -4.98, false);
      cbox(cw, 0.5, 0.04, glass, x, FY + 1.33, -5.75, false).renderOrder = 6;
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
      cLabels.push({ el, st, dot, body, strip, p: new THREE.Vector3(x, FY + 1.75, -5.5) });
    });
  }

  const gBody = T(new THREE.CapsuleGeometry(0.2, 0.5, 4, 12)), gHead = T(new THREE.SphereGeometry(0.16, 16, 12)), gTag = T(new THREE.SphereGeometry(0.075, 10, 8));
  const gPlate = T(new THREE.CylinderGeometry(0.2, 0.17, 0.03, 20)), gFood = T(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), gCup = T(new THREE.CylinderGeometry(0.05, 0.045, 0.13, 12));
  const mats = {
    w: M('#E9B949', { roughness: 0.6 }), s: M('#2E8B6C', { roughness: 0.6 }), head: M('#F4E6D4', { roughness: 0.7 }), tag: M('#4C5FD5', { roughness: 0.4 }),
    plate: M('#FFFFFF', { roughness: 0.3 }), food: [M('#E39A4B'), M('#D8693E'), M('#C9B25A'), M('#9DBE6A')], cup: M('#7FB7D8', { roughness: 0.2 }),
  };
  const agents = new Map<string, Agent>();
  const N = (p: XZ, o: Omit<Node, 'v'> = {}): Node => ({ v: new THREE.Vector3(p[0], 0, p[1]), ...o });
  const ENTRY: XZ = [-4.55, 4.45];
  let runKey: string | null = null, speedMul = 1;

  function spawn(u: SceneCustomer) {
    const g = new THREE.Group(), b = new THREE.Mesh(gBody, mats.w), h = new THREE.Mesh(gHead, mats.head);
    b.position.y = FY + 0.46;
    h.position.y = FY + 1.08;
    b.castShadow = h.castShadow = true;
    g.add(b, h);
    if (u.manual) { const t = new THREE.Mesh(gTag, mats.tag); t.position.y = FY + 1.36; g.add(t); }
    const j = (Math.random() - 0.5) * 1.6;
    g.position.set(-4.5 + j, 0, D2 + 1.4);
    g.rotation.y = Math.PI;
    world.add(g);
    const a: Agent = { g, b, h, path: [N([-4.5 + j * 0.6, 6.6]), N(ENTRY)], laneEnd: SCENE_AVATAR_LIMIT, stage: 'queue', counter: 0, wait: 0, ph: Math.random() * 6 };
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
    a.b.material = mats.s;
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
    a.path.push(N([cx, -4.35], { wait: 0.6, face: Math.PI, fn: () => { a.stage = 'dine'; } }));
    a.path.push(N([cx, -3.4]), N([6.7, -3.65]), N([7.9, -3.65]));
    const free = chairs.filter(c => !c.busy);
    if (!free.length) { a.path.push(...exitPath(a, null)); return; }
    const ch = free[Math.floor(Math.random() * free.length)];
    ch.busy = true;
    a.chair = ch;
    a.path.push(N([7.9, ch.aisle]), N([ch.x, ch.aisle]), N([ch.x, ch.z], { face: ch.s < 0 ? 0 : Math.PI, fn: () => sit(a) }));
  }
  function sit(a: Agent) {
    const ch = a.chair!;
    a.stage = 'eat';
    a.eatT = 0;
    a.eatDur = (9 + Math.random() * 7) * speedMul;
    const tr = new THREE.Group(), pl = new THREE.Mesh(gPlate, mats.plate), fd = new THREE.Mesh(gFood, mats.food[Math.floor(Math.random() * 4)]), cu = new THREE.Mesh(gCup, mats.cup);
    pl.position.y = 0.015;
    fd.position.y = 0.03;
    cu.position.set(0.24, 0.065, 0);
    pl.castShadow = cu.castShadow = true;
    tr.add(pl, fd, cu);
    tr.position.set(ch.x, FY + 0.8, ch.tz + ch.s * 0.26);
    world.add(tr);
    a.tray = tr;
    a.food = fd;
  }
  function stand(a: Agent) {
    a.stage = 'exit';
    a.h.position.y = FY + 1.08;
    a.b.rotation.x = 0;
    if (a.tray) { world.remove(a.tray); a.tray = null; }
    const aisle = a.chair!.aisle;
    a.chair!.busy = false;
    a.path = exitPath(a, aisle);
  }
  function remove(id: string, a: Agent) {
    world.remove(a.g);
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
  // Plain wheel keeps scrolling the page; pinch (ctrlKey on trackpads) or ctrl+wheel zooms.
  cvs.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const k = 0.012;
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
      const p = a.g.position;
      if (a.fading != null) {
        a.fading += dt;
        if (!a.fade) {
          a.fade = [(a.b.material as THREE.Material).clone(), mats.head.clone()];
          a.fade.forEach(m => { m.transparent = true; });
          a.b.material = a.fade[0];
          a.h.material = a.fade[1];
        }
        const o = Math.max(0, 1 - a.fading / 0.6);
        a.fade.forEach(m => { m.opacity = o; });
        if (a.fading > 0.6) { remove(id, a); return; }
      }
      if (a.stage === 'eat') {
        a.eatT! += dt;
        const e = Math.min(1, a.eatT! / a.eatDur!);
        if (a.food) { const sc = 1 - e * 0.85; a.food.scale.set(sc, sc, sc); }
        const nod = reduced ? 0 : Math.max(0, Math.sin(a.eatT! * 3.2 + a.ph)) * 0.16;
        a.b.rotation.x = nod;
        a.h.position.y = FY + 1.08 - nod * 0.12;
        p.y = -0.24;
        if (e >= 1) stand(a);
        return;
      }
      if (a.wait > 0) { a.wait -= dt; p.y = 0; return; }
      if (!a.path.length) { p.y = 0; return; }
      const q = a.path[0];
      tmp.subVectors(q.v, p);
      tmp.y = 0;
      const dist = tmp.length();
      let rem = dist;
      for (let i = 1; i < a.path.length; i++) rem += a.path[i - 1].v.distanceTo(a.path[i].v);
      const sp = reduced ? 1e4 : a.stage === 'dine' || a.stage === 'exit' ? 2.4 : Math.max(2.4, rem / (a.stage === 'serve' ? 2.2 : 3.2));
      const step = sp * dt;
      if (dist <= step) {
        p.x = q.v.x;
        p.z = q.v.z;
        a.path.shift();
        if (q.face != null) a.g.rotation.y = q.face;
        if (q.wait) a.wait = q.wait;
        q.fn?.();
      } else {
        p.addScaledVector(tmp.normalize(), step);
        const ty = Math.atan2(tmp.x, tmp.z);
        let d = ty - a.g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a.g.rotation.y += d * Math.min(1, dt * 12);
      }
      a.ph += dt * 13;
      p.y = reduced ? 0 : Math.abs(Math.sin(a.ph)) * 0.045;
    });
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
