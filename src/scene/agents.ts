import * as THREE from 'three';
import { D2, ENTRY, FY, HEAD, N, SCENE_AVATAR_LIMIT, SEAT_DROP, SLOT, counterXs, diningChairs, glance, pick, pose, stepTo, texting, wanted } from './pure';
import type { Chair, Fig, Node, SceneCustomer } from './pure';
import type { Audio } from './audio';
import { LEAVE_TRAY, blocked, joinGroup, pickChair, sidestep, trimLeftovers } from './crowd';
import type { Group, Leftover } from './crowd';
import type { People } from './people';
import type { Stage } from './stage';

// Read-only to other modules (overlays look up who is where); only this module moves or removes agents.
export type Agent = {
  u: SceneCustomer; f: Fig; path: Node[]; laneEnd: number;
  stage: 'queue' | 'serve' | 'dine' | 'eat' | 'exit'; counter: number; wait: number; ph: number;
  leaving?: boolean; chair?: Chair; tray?: THREE.Group | null; food?: THREE.Mesh;
  eatT?: number; eatDur?: number; fading?: number; fade?: THREE.Material[];
  group?: number | null; stuck?: number;
};
type View = { speed: number; runKey: string; live: boolean; waiting: SceneCustomer[]; serving: (SceneCustomer | null)[] };

// Customers: walk in, queue along the lane, get served, carry the meal to a free chair, eat, chat, and leave.
// Visual only: the scene mirrors which ids the engine has waiting or in service and never feeds back.
// `leftovers` is shared with the cleaner: trays diners left on tables, oldest first.
export function createAgents({ reduced, world, T }: Stage, { person, customerLook, mats }: People, shot: Audio['shot'], leftovers: Leftover[]) {
  const gTag = T(new THREE.SphereGeometry(0.075, 10, 8));
  const gPlate = T(new THREE.CylinderGeometry(0.2, 0.17, 0.03, 20)), gFood = T(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), gCup = T(new THREE.CylinderGeometry(0.05, 0.045, 0.13, 12));
  const agents = new Map<string, Agent>(), chairs = diningChairs();
  const groups: Group[] = [];
  let xs: number[] = [], runKey: string | null = null, speedMul = 1, arriving = 0;

  function spawn(u: SceneCustomer) {
    // People who show up in the same update wait their turn outside the door, four abreast, instead of entering as one blob.
    const j = arriving ? (arriving % 4 - 1.5) * 0.75 : (Math.random() - 0.5) * 1.6;
    const f = person(world, customerLook(), -4.5 + j, D2 + 1.4 + Math.floor(arriving / 4) * 0.55, Math.PI);
    f.g.scale.set(0.92 + Math.random() * 0.18, 0.94 + Math.random() * 0.12, 0.92 + Math.random() * 0.18);
    if (u.manual) { const t = new THREE.Mesh(gTag, mats.tag); t.position.y = FY + 1.36; f.g.add(t); }
    const a: Agent = { u, f, path: [N([-4.5 + j * 0.6, 6.6]), N(ENTRY)], laneEnd: SCENE_AVATAR_LIMIT, stage: 'queue', counter: 0, wait: 0, ph: Math.random() * 6, group: joinGroup(groups, u.arrivedAt) };
    a.wait = arriving++ * 0.25;
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
    // Friends who came in together sit at the same table when there is room.
    const mates = [...agents.values()].filter(m => m !== a && m.group != null && m.group === a.group && m.chair).map(m => m.chair!);
    const ch = pickChair(chairs, mates);
    if (!ch) { a.path.push(...exitPath(a, null)); return; }
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
    const ch = a.chair!;
    // Some diners leave the tray for the cleaner; the oldest trays go once too many pile up.
    if (a.tray && Math.random() < LEAVE_TRAY) {
      leftovers.push({ tray: a.tray, x: ch.x, aisle: ch.aisle, face: ch.s < 0 ? 0 : Math.PI });
      trimLeftovers(leftovers).forEach(l => l.tray.removeFromParent());
    } else if (a.tray) world.remove(a.tray);
    a.tray = null;
    const aisle = ch.aisle;
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
  function clearAll() {
    [...agents].forEach(([id, a]) => remove(id, a));
    chairs.forEach(c => { c.busy = false; });
    leftovers.splice(0).forEach(l => l.tray.removeFromParent());
  }

  // One customer for one frame; true while they are walking. `queuers` are the queueing customers with their lane slot.
  function step(a: Agent, id: string, dt: number, now: number, queuers: { p: THREE.Vector3; k: number }[]) {
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
      if (a.fading > 0.6) { remove(id, a); return false; }
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
      return false;
    }
    let walk: number | null = null;
    if (a.wait > 0) a.wait -= dt;
    else if (a.path.length) {
      const q = a.path[0];
      let rem = Math.hypot(q.v.x - p.x, q.v.z - p.z);
      for (let i = 1; i < a.path.length; i++) rem += a.path[i - 1].v.distanceTo(a.path[i].v);
      const sp = reduced ? 1e4 : a.stage === 'dine' || a.stage === 'exit' ? 2.4 : Math.max(2.4, rem / (a.stage === 'serve' ? 2.2 : 3.2));
      // In the queue, wait for someone ahead in the engine's order instead of walking through them; whoever is ahead in
      // that order may pass people behind them, and nobody is held for long, so the lane never jams.
      const held = a.stage === 'queue' && (a.stuck ?? 0) < 2.5
        && blocked(p, q.v.x - p.x, q.v.z - p.z, queuers.filter(o => o.k < a.laneEnd).map(o => o.p));
      a.stuck = held ? (a.stuck ?? 0) + dt : 0;
      if (!held && a.stage === 'queue' && !reduced) {
        const [ox, oz] = sidestep(p, q.v.x - p.x, q.v.z - p.z, queuers.filter(o => o.p !== p).map(o => o.p));
        p.x += ox;
        p.z += oz;
      }
      if (held) { /* stand still this frame */ } else if (stepTo(a.f.g, q.v, sp * dt, dt)) {
        a.path.shift();
        if (q.face != null) a.f.g.rotation.y = q.face;
        if (q.wait) a.wait = q.wait;
        q.fn?.();
      } else walk = a.ph += dt * 13;
    }
    p.y = walk == null || reduced ? 0 : Math.abs(Math.sin(walk)) * 0.03;
    pose(a.f, reduced ? null : walk, a.tray ? 1.25 : 0);
    a.f.head.rotation.y = walk == null && !reduced ? glance(now, a.ph) : 0;
    texting(a.f, !!a.f.phone && a.stage === 'queue' && !a.tray);
    return walk != null;
  }

  return {
    chairs,
    list: agents as ReadonlyMap<string, Agent>,
    setCounters(c: number) { clearAll(); xs = counterXs(c)[0]; },
    sync(view: View) {
      speedMul = view.speed === 1 ? 2.4 : view.speed === 5 ? 1.4 : 1;
      if (view.runKey !== runKey) { clearAll(); runKey = view.runKey; }
      if (!view.live) { clearAll(); return; }
      const want = wanted(view.waiting, view.serving);
      arriving = 0;
      want.forEach((w, id) => {
        const a = agents.get(id) ?? spawn(w.u);
        // Service entries carry no arrival time; keep the one seen while the customer was waiting.
        a.u = { ...w.u, arrivedAt: w.u.arrivedAt ?? a.u.arrivedAt };
        if (a.leaving) return;
        if (w.st === 'w') {
          if (w.k < a.laneEnd) { for (let j = a.laneEnd - 1; j >= w.k; j--) a.path.push(N(SLOT(j))); a.laneEnd = w.k; }
        } else if (a.stage !== 'serve') toCounter(a, w.i);
      });
      agents.forEach((a, id) => { if (!want.has(id) && !a.leaving) leave(a); });
    },
    // Returns how many customers are walking this frame.
    frame(dt: number, now: number) {
      let walkers = 0;
      const queuers: { p: THREE.Vector3; k: number }[] = [];
      agents.forEach(a => { if (a.stage === 'queue' && a.fading == null) queuers.push({ p: a.f.g.position, k: a.laneEnd }); });
      agents.forEach((a, id) => { if (step(a, id, dt, now, queuers)) walkers++; });
      return walkers;
    },
    dispose() { agents.forEach(a => a.fade?.forEach(m => m.dispose())); },
  };
}
