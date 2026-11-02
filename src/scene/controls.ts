import * as THREE from 'three';
import { D2, FY, H2, collide } from './pure';
import type { XZ } from './pure';
import type { Stage } from './stage';

type CameraView = { rot: number; zoom: number; resetNonce: number; walk: boolean };
// WASD / arrows move and Q/E turn, while the scene is hovered, fullscreen or pointer-locked.
const MOVE: Record<string, XZ> = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
// First person: eye at NPC head height, starting outside the entrance and facing in.
const EYE = FY + 1.08, SPAWN: XZ = [-4.5, D2 + 1.2];

// Orbit camera (drag, wheel, pinch, buttons, keyboard pan) and the first-person walk mode.
export function createControls({ host, cvs, camera, reduced }: Stage, setWalk: (on: boolean) => void, view: () => CameraView | null) {
  let dAz = 0, dPol = 0, wz = 1, pinchD = 0, nonce: number | null = null;
  const cur = { az: -0.62, pol: 0.9, r: 40 };
  const ptr = { on: false, x: 0, y: 0 }, touches = new Map<number, XZ>();
  const tgt = new THREE.Vector3(0.4, 0, 1.4), tmp = new THREE.Vector3();
  const eye = new THREE.Vector3(SPAWN[0], 0, SPAWN[1]);
  let walking = false, yaw = Math.PI, pitch = -0.05, stride = 0, hover = false, fast = false;
  const held = new Set<string>();
  const clampZ = (z: number) => Math.max(0.55, Math.min(2.6, z));
  const baseZoom = () => view()?.zoom || 1;
  const look = (dx: number, dy: number) => { yaw -= dx; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy)); };
  function setWalking(on: boolean) {
    walking = on;
    if (on) { eye.set(SPAWN[0], 0, SPAWN[1]); yaw = Math.PI; pitch = -0.05; }
    else if (document.pointerLockElement === cvs) document.exitPointerLock();
    setWalk(on);
    camera.fov = on ? 60 : 30;
    camera.near = on ? 0.05 : 0.5;
    camera.updateProjectionMatrix();
  }

  const ac = new AbortController(), signal = ac.signal;
  // Wheel / two-finger scroll over the scene zooms; pinch (ctrlKey on trackpads) sends small deltas, so it gets a bigger k.
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    if (walking) return;
    const k = e.ctrlKey ? 0.012 : 0.0025;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    wz = clampZ(baseZoom() * wz * Math.exp(-dy * k)) / baseZoom();
  }, { passive: false, signal });
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
  }, { signal });
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
  }, { signal });
  const up = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchD = 0;
    if (!touches.size) { ptr.on = false; cvs.style.cursor = ''; }
  };
  cvs.addEventListener('pointerup', up, { signal });
  cvs.addEventListener('pointercancel', up, { signal });
  cvs.addEventListener('dblclick', () => { if (!walking) { dAz = 0; dPol = 0; wz = 1; tgt.set(0.4, 0, 1.4); } }, { signal });
  cvs.addEventListener('pointerenter', () => { hover = true; }, { signal });
  cvs.addEventListener('pointerleave', () => { hover = false; }, { signal });
  document.addEventListener('keydown', e => {
    fast = e.shiftKey;
    if (!(e.code in MOVE || e.code === 'KeyQ' || e.code === 'KeyE') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!hover && !document.fullscreenElement?.contains(host) && document.pointerLockElement !== cvs) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="slider"], [role="tab"], dialog')) return;
    e.preventDefault();
    held.add(e.code);
  }, { signal });
  document.addEventListener('keyup', e => { fast = e.shiftKey; held.delete(e.code); }, { signal });
  window.addEventListener('blur', () => held.clear(), { signal });

  return {
    tgt,
    // Moves the camera for this frame; returns whether walk mode is on.
    frame(dt: number) {
      const last = view();
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
        collide(eye);
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
      return walking;
    },
    dispose() { ac.abort(); },
  };
}
