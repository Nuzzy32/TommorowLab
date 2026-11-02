import * as THREE from 'three';
import { CEIL, D2, FW, FD, FY, H2, LABEL_FONT, TABLES, WALLS, diningChairs } from './pure';
import type { XZ } from './pure';
import type { People } from './people';
import type { Stage } from './stage';

// The building and everything in it that does not move on its own: floors, walls, furniture, signs, the mushola,
// zone volumes and labels, plus the walk-only ceiling items. Steam, the TV picture and the fans animate in `frame`.
export function createRoom({ reduced, world, T, M, box, many, merge }: Stage, mats: People['mats']) {
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
  const skirting: number[][] = [], uppers: number[][] = [];
  WALLS.forEach(([x1, z1, x2, z2, h = 1.5, t = 0.24], i) => {
    const dx = x2 - x1, dz = z2 - z1;
    skirting.push([(x1 + x2) / 2, FY + 0.05, (z1 + z2) / 2, -Math.atan2(dz, dx), Math.hypot(dx, dz) + t, 1, t + 0.03]);
    if (h >= 1.5) uppers.push([(x1 + x2) / 2, (FY + h + CEIL) / 2, (z1 + z2) / 2, -Math.atan2(dz, dx), Math.hypot(dx, dz) + t, CEIL - FY - h, t]);
    const m = new THREE.Mesh(T(new THREE.BoxGeometry(Math.hypot(dx, dz) + t, h, t)), wMats);
    m.position.set((x1 + x2) / 2, FY + h / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.castShadow = m.receiveShadow = true;
    world.add(m);
    // Doormats inside the entrance and the exit.
    if (i === 5) {
      box(world, 4.2, 0.08, 1.8, M('#E6EBE8', { roughness: 0.95 }), -4.5, 0.04, D2 + 0.9, false);
      box(world, 2.0, 0.08, 1.8, M('#E6EBE8', { roughness: 0.95 }), 10.2, 0.04, D2 + 0.9, false);
    }
  });

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
  const dummy = new THREE.Object3D();
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

  const seats: number[][] = [], backs: number[][] = [], stems: number[][] = [], tops: number[][] = [], tlegs: number[][] = [], vases: number[][] = [];
  const chairAt = (x: number, z: number, s: number) => { seats.push([x, FY + 0.315, z]); backs.push([x, FY + 0.55, z + s * 0.2]); stems.push([x, FY + 0.15, z]); };
  TABLES.forEach(([tx, tz]) => {
    tops.push([tx, FY + 0.59, tz]);
    tlegs.push([tx - 0.75, FY + 0.28, tz], [tx + 0.75, FY + 0.28, tz]);
    vases.push([tx, FY + 0.68, tz]);
  });
  diningChairs().forEach(c => chairAt(c.x, c.tz + c.s * 0.8, c.s));
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
  many(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 10), M('#C0392B', { roughness: 0.3 }), TABLES.map(([x, z]) => [x - 0.16, FY + 0.685, z + 0.06]), false);
  many(new THREE.CylinderGeometry(0.032, 0.032, 0.15, 10), M('#2B1D16', { roughness: 0.3 }), TABLES.map(([x, z]) => [x - 0.24, FY + 0.695, z - 0.04]), false);
  many(new THREE.BoxGeometry(0.12, 0.07, 0.07), M('#FAFAF7'), TABLES.map(([x, z]) => [x + 0.22, FY + 0.655, z]), false);
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

  return {
    dark, crate,
    setWalk(on: boolean) {
      shells.forEach(m => { m.visible = !on; });
      walkOnly.forEach(m => { m.visible = on; });
    },
    frame(now: number, dt: number, walking: boolean) {
      if (!reduced) { puff(now / 1000); drawTv(now / 1000); }
      if (walking && !reduced) fans.forEach(f => { f.rotation.y += dt * 7; });
    },
  };
}
