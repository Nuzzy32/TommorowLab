import * as THREE from 'three';
import { D2, FY, N, SEAT_DROP, counterXs, glance, pick, pose, stepTo, texting } from './pure';
import type { Fig, Node } from './pure';
import { detour } from './crowd';
import type { Leftover } from './crowd';
import type { Look, People } from './people';
import type { Stage } from './stage';

// Staff loop over `route`; `busy` undefined means they work only while paused at a stop.
type Crew = { f: Fig; route: Node[]; i: number; wait: number; ph: number; busy?: boolean; seated?: boolean; texting?: boolean; tool?: THREE.Object3D; load?: THREE.Object3D; detour?: Node[] };

// Staff and the counters they work at: cooks, a store hand, a cleaner, a driver outside and one server per counter.
// `leftovers` are trays diners left on tables (filled by agents.ts); the cleaner takes them to the rack.
export function createCrew({ reduced, world, T, M, box }: Stage, { person, mats, crewM, skins, pants, hairs, hijabs }: People, { dark, crate }: { dark: THREE.Material; crate: THREE.Material }, leftovers: Leftover[]) {
  let counters = new THREE.Group(), paints: { body: THREE.MeshStandardMaterial; strip: THREE.MeshStandardMaterial }[] = [];
  world.add(counters);
  const glass = M('#FFFFFF', { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false });
  const ringGeo = T(new THREE.RingGeometry(0.32, 0.4, 32));
  const ringMat = T(new THREE.MeshBasicMaterial({ color: '#2E8B6C', transparent: true, opacity: 0.35 }));
  const counterTrash: { dispose(): void }[] = [];
  const kitchen = (): Look => ({ shirt: crewM.coat, sleeves: true, pants: crewM.slacks, skin: pick(skins), hat: 'chef', apron: crewM.apron });
  const staff = (k: Look, route: Node[], extra: Partial<Crew> = {}, parent: THREE.Object3D = world): Crew => {
    const { x, z } = route[0].v;
    return { f: person(parent, k, x, z, route[0].face ?? 0), route, i: 0, wait: 0, ph: Math.random() * 6, ...extra };
  };
  let servers: Crew[] = [], cleaner: Crew;
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
    cleaner = c;
  }

  // Send the cleaner for the oldest unclaimed tray: pick it up at the table, carry it to the rack, then resume mopping.
  function fetchTray(l: Leftover) {
    l.claimed = true;
    const [toAisle, table, back, toRack, rack, fromRack] = detour(l);
    cleaner.wait = 0;
    cleaner.detour = [N(toAisle), N(table, { face: l.face, wait: 1.2, fn: () => {
      const i = leftovers.indexOf(l);
      if (i >= 0) leftovers.splice(i, 1);
      l.tray.position.set(0, FY + 0.78, 0.34);
      cleaner.f.g.add(l.tray);
      cleaner.load = l.tray;
      if (cleaner.tool) cleaner.tool.visible = false;
    } }), N(back), N(toRack), N(rack, { face: Math.PI / 2, wait: 1.0, fn: () => {
      l.tray.removeFromParent();
      cleaner.load = undefined;
      if (cleaner.tool) cleaner.tool.visible = true;
    } }), N(fromRack)];
  }
  function tick(w: Crew, dt: number) {
    const q = w.detour?.length ? w.detour[0] : w.route[w.i];
    let walk: number | null = null;
    if (w.wait > 0) w.wait -= dt;
    else if (stepTo(w.f.g, q.v, reduced ? 1e4 : (w.detour?.length ? 1.6 : 1.2) * dt, dt)) {
      if (q.face != null) w.f.g.rotation.y = q.face;
      w.wait = q.wait ?? 0;
      q.fn?.();
      if (w.detour?.length) w.detour.shift();
      else w.i = (w.i + 1) % w.route.length;
    } else walk = w.ph += dt * 9;
    if (walk == null) w.ph += dt * 5;
    const working = w.busy ?? w.wait > 0, wob = reduced ? 0 : Math.sin(w.ph);
    pose(w.f, reduced ? null : walk, w.load?.visible ? 1.25 : working ? 0.85 + wob * 0.2 : 0, w.seated);
    w.f.head.rotation.y = walk == null && !working && !reduced ? glance(performance.now(), w.ph) : 0;
    if (w.texting) texting(w.f, true);
    if (w.tool) w.tool.rotation.y = working ? wob * 0.5 : 0;
    w.f.g.position.y = w.seated ? SEAT_DROP : walk == null || reduced ? 0 : Math.abs(Math.sin(walk)) * 0.03;
    return walk != null;
  }

  return {
    // Rebuild the counter row and its servers for c counters.
    setCounters(c: number) {
      counterTrash.splice(0).forEach(x => x.dispose());
      world.remove(counters);
      counters = new THREE.Group();
      world.add(counters);
      const [xs, cw] = counterXs(c);
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
      paints = xs.map((x, i) => {
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
        return { body, strip };
      });
    },
    setBusy(i: number, busy: boolean) {
      const P = paints[i];
      if (!P) return;
      if (servers[i]) servers[i].busy = busy;
      P.body.color.set(busy ? '#CDEBDD' : '#F3F6F4');
      P.strip.color.set(busy ? '#2E8B6C' : '#B9C6BF');
      P.strip.emissive.set(busy ? '#1E6B52' : '#000000');
    },
    // Returns how many of the fixed crew are walking (servers stand behind their counters).
    frame(dt: number) {
      if (!cleaner.detour?.length) { const l = leftovers.find(x => !x.claimed); if (l) fetchTray(l); }
      let walkers = 0;
      crew.forEach(w => { if (tick(w, dt)) walkers++; });
      servers.forEach(w => tick(w, dt));
      return walkers;
    },
    dispose() { counterTrash.forEach(x => x.dispose()); },
  };
}
