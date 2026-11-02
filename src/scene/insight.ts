import * as THREE from 'three';
import { formatClock } from '../app/format';
import { FY, HEAD, SCENE_AVATAR_LIMIT, SLOT } from './pure';
import type { Agent } from './agents';
import type { Stage } from './stage';

// Data drawn into the scene: how long each waiting customer has waited, where the queue has been standing lately,
// and, in walk mode, who the viewer is looking at. Visual only; every number comes from the engine's view.

// Wait bands for the chips: under a minute is fine, three minutes or more is a long wait.
export const WAIT_OK = 60, WAIT_LONG = 180;
export const waitTone = (sec: number) => (sec < WAIT_OK ? 'ok' : sec < WAIT_LONG ? 'warn' : 'long');
// Chips have a fixed size in CSS, so placement never reads layout.
export const CHIP_W = 46, CHIP_H = 18;
// In walk mode chips show within this radius; the look-at card picks someone within LOOK_RANGE near the centre.
export const CHIP_RANGE = 6, LOOK_RANGE = 4, LOOK_RADIUS = 0.35;
const HEAT_TAU = 8, HEAT_EVERY = 0.25;
const LANE = Array.from({ length: SCENE_AVATAR_LIMIT }, (_, k) => SLOT(k));

// Lane slot within half a slot spacing (1.3) of (x, z), or -1.
export function nearestSlot(x: number, z: number) {
  let best = -1, bd = 0.65;
  LANE.forEach(([sx, sz], k) => { const d = Math.hypot(x - sx, z - sz); if (d < bd) { bd = d; best = k; } });
  return best;
}
// Each slot's share of the recent past it was occupied, with time constant `tau` seconds.
export function decayHeat(heat: number[], occupied: Set<number>, dt: number, tau = HEAT_TAU) {
  const keep = Math.exp(-dt / tau);
  heat.forEach((h, k) => { heat[k] = h * keep + (occupied.has(k) ? 1 - keep : 0); });
  return heat;
}
// Longest waits first; a chip that would overlap one already placed is dropped.
export function placeChips<B extends { x: number; y: number; wait: number }>(boxes: B[], w = CHIP_W, h = CHIP_H) {
  const kept: B[] = [];
  [...boxes].sort((a, b) => b.wait - a.wait).forEach(b => {
    if (kept.every(k => Math.abs(k.x - b.x) >= w + 2 || Math.abs(k.y - b.y) >= h + 2)) kept.push(b);
  });
  return kept;
}
// Index of the candidate nearest the screen centre (normalised device coords) within reach, or -1.
export function pickLookAt(c: { x: number; y: number; d: number }[], radius = LOOK_RADIUS, range = LOOK_RANGE) {
  let best = -1, br = radius;
  c.forEach((p, i) => { const r = Math.hypot(p.x, p.y); if (p.d <= range && r < br) { br = r; best = i; } });
  return best;
}
export const who = (id: string) => (id.startsWith('m:') ? `Tambahan manual ${id.slice(2)}` : `Pelanggan ${id.slice(2)}`);
export function doing(stage: Agent['stage'], wait: number | null) {
  if (stage === 'queue') return wait == null ? 'Mengantre' : `Menunggu ${formatClock(wait)}`;
  return stage === 'serve' ? 'Sedang dilayani' : stage === 'dine' ? 'Membawa makanan' : stage === 'eat' ? 'Sedang makan' : 'Selesai, keluar';
}

export function createInsight({ host, camera, size, world, T }: Stage, agents: ReadonlyMap<string, Agent>) {
  const layer = document.createElement('div');
  layer.className = 'scene-insight';
  layer.setAttribute('aria-hidden', 'true');
  host.appendChild(layer);
  const card = document.createElement('div');
  card.className = 'scene-look-card';
  card.hidden = true;
  const cardName = document.createElement('b'), cardArrived = document.createElement('span'), cardDoing = document.createElement('span');
  card.append(cardName, cardArrived, cardDoing);
  layer.appendChild(card);
  const chips = new Map<string, HTMLDivElement>();

  // Heatmap: one plane per lane slot, grown and reddened by how much of the recent past someone stood there.
  const heat = LANE.map(() => 0);
  const heatMesh = T(new THREE.InstancedMesh(T(new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2)),
    T(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false })), LANE.length));
  heatMesh.renderOrder = 2;
  world.add(heatMesh);
  const dummy = new THREE.Object3D(), low = new THREE.Color('#E9B949'), high = new THREE.Color('#C0392B'), tint = new THREE.Color();
  function drawHeat() {
    LANE.forEach(([x, z], k) => {
      dummy.position.set(x, FY + 0.009, z);
      dummy.scale.setScalar(heat[k] < 0.02 ? 0 : 0.25 + heat[k] * 0.75);
      dummy.updateMatrix();
      heatMesh.setMatrixAt(k, dummy.matrix);
      heatMesh.setColorAt(k, tint.lerpColors(low, high, heat[k]));
    });
    heatMesh.instanceMatrix.needsUpdate = true;
    if (heatMesh.instanceColor) heatMesh.instanceColor.needsUpdate = true;
  }
  drawHeat();

  let on = true, clock = 0, sinceHeat = 0;
  const tmp = new THREE.Vector3();
  const anchor = (a: Agent, lift: number) => tmp.set(a.f.g.position.x, a.f.g.position.y + (HEAD + lift) * a.f.g.scale.y, a.f.g.position.z);
  const toScreen = (v: THREE.Vector3) => ({ x: (v.x + 1) / 2 * size.w, y: (1 - v.y) / 2 * size.h });
  const place = (el: HTMLElement, x: number, y: number) => { el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`; };

  return {
    sync(view: { insight: boolean; clock: number }) {
      on = view.insight;
      clock = view.clock;
      layer.hidden = !on;
      heatMesh.visible = on;
    },
    frame(dt: number, walking: boolean) {
      if (!on) return;
      sinceHeat += dt;
      if (sinceHeat >= HEAT_EVERY) {
        const occupied = new Set<number>();
        agents.forEach(a => { if (a.stage === 'queue') { const k = nearestSlot(a.f.g.position.x, a.f.g.position.z); if (k >= 0) occupied.add(k); } });
        decayHeat(heat, occupied, sinceHeat);
        drawHeat();
        sinceHeat = 0;
      }
      // Chips for waiting customers that are on screen (and near the eye while walking).
      const boxes: { id: string; x: number; y: number; wait: number }[] = [];
      agents.forEach((a, id) => {
        if (a.stage !== 'queue' || a.u.arrivedAt == null || a.fading != null) return;
        const p = anchor(a, 0.34);
        if (walking && p.distanceTo(camera.position) > CHIP_RANGE) return;
        p.project(camera);
        if (p.z >= 1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02) return;
        boxes.push({ id, ...toScreen(p), wait: Math.max(0, clock - a.u.arrivedAt) });
      });
      const shown = new Set<string>();
      placeChips(boxes).forEach(b => {
        let el = chips.get(b.id);
        if (!el) { el = document.createElement('div'); el.className = 'scene-wait-chip'; layer.appendChild(el); chips.set(b.id, el); }
        const text = formatClock(b.wait), tone = waitTone(b.wait);
        if (el.textContent !== text) el.textContent = text;
        if (el.dataset.tone !== tone) el.dataset.tone = tone;
        el.hidden = false;
        place(el, b.x, b.y);
        shown.add(b.id);
      });
      chips.forEach((el, id) => {
        if (shown.has(id)) return;
        if (agents.has(id) && agents.get(id)!.stage === 'queue') el.hidden = true;
        else { el.remove(); chips.delete(id); }
      });
      // Walk mode: a card for whoever is nearest the middle of the view.
      if (!walking) { card.hidden = true; return; }
      const near: { id: string; a: Agent; x: number; y: number; d: number }[] = [];
      agents.forEach((a, id) => {
        if (a.fading != null) return;
        const p = anchor(a, 0.1), d = p.distanceTo(camera.position);
        p.project(camera);
        if (p.z < 1) near.push({ id, a, x: p.x, y: p.y, d });
      });
      const pick = near[pickLookAt(near)];
      card.hidden = !pick;
      if (!pick) return;
      const { a } = pick, at = a.u.arrivedAt;
      const chip = chips.get(pick.id);
      if (chip) chip.hidden = true;
      cardName.textContent = who(pick.id);
      cardArrived.textContent = at == null ? '' : `Tiba ${formatClock(at)}`;
      cardDoing.textContent = doing(a.stage, at == null ? null : Math.max(0, clock - at));
      const s = toScreen(tmp.set(pick.x, pick.y, 0));
      place(card, s.x, s.y - 26);
    },
    dispose() { layer.remove(); },
  };
}
