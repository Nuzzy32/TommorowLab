import * as THREE from 'three';
import { FY, counterXs, declutter } from './pure';
import type { Stage } from './stage';

type Label = { el: HTMLDivElement; st: HTMLSpanElement; p: THREE.Vector3 };

// DOM labels that float over the canvas ("L1 · Melayani"), projected from their 3D anchor every frame.
export function createOverlay({ host, camera, size }: Stage) {
  const overlay = document.createElement('div');
  overlay.className = 'scene-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  host.appendChild(overlay);
  const tmp = new THREE.Vector3();
  let labels: Label[] = [], count = 0;

  return {
    setCounters(c: number) {
      labels.forEach(l => l.el.remove());
      count = c;
      labels = counterXs(c)[0].map((x, i) => {
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
        return { el, st, p: new THREE.Vector3(x, FY + 2.3, -6.2) };
      });
    },
    setBusy(i: number, busy: boolean) {
      const L = labels[i];
      if (!L) return;
      L.st.textContent = busy ? 'Melayani' : 'Kosong';
      L.el.dataset.busy = String(busy);
      L.st.hidden = count > 3;
    },
    frame() {
      const boxes = labels.map(L => {
        tmp.copy(L.p).project(camera);
        const w = L.el.offsetWidth || 60, h = L.el.offsetHeight || 22;
        return { L, vis: tmp.z < 1, x: (tmp.x + 1) / 2 * size.w - w / 2, y: (1 - tmp.y) / 2 * size.h - h, w, h };
      }).filter(b => { b.L.el.style.display = b.vis ? 'flex' : 'none'; return b.vis; });
      declutter(boxes).forEach(b => { b.L.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`; });
    },
    dispose() { overlay.remove(); },
  };
}
