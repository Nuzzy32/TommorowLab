import * as THREE from 'three';
import { FY, HEAD, HIP, pick } from './pure';
import type { Fig } from './pure';
import type { Stage } from './stage';

export type Look = {
  shirt: THREE.Material; pants: THREE.Material; skin: THREE.Material; hair?: THREE.Material; style?: 'short' | 'long' | 'bun'; hijab?: THREE.Material;
  glasses?: boolean; bag?: THREE.Material; sleeves?: boolean; hat?: 'chef' | 'hard'; hatMat?: THREE.Material; apron?: THREE.Material; phone?: boolean;
};

// Palettes, body geometry and `person`, which assembles a jointed low-poly figure from a Look.
export function createPeople({ T, M, merge }: Stage) {
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

  // Faces, shoes and hands are baked into the limb geometry as vertex colours, so detail adds no draw calls.
  // White vertices take the material colour (skin, pants, sleeve); dark ones stay dark whatever it is.
  const paint = (geo: THREE.BufferGeometry, hex: THREE.ColorRepresentation = '#FFFFFF') => {
    const c = new THREE.Color(hex), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
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
  const customerLook = (): Look => {
    const covered = Math.random() < 0.35;
    return {
      shirt: mats.w, pants: pick(pants), skin: pick(skins),
      ...(covered ? { hijab: pick(hijabs) } : { hair: pick(hairs), style: pick(['short', 'short', 'long', 'bun'] as const) }),
      glasses: Math.random() < 0.2, bag: Math.random() < 0.25 ? pick(bags) : undefined, phone: Math.random() < 0.4,
    };
  };
  return { mats, skins, hairs, pants, hijabs, crewM, person, customerLook };
}
export type People = ReturnType<typeof createPeople>;
