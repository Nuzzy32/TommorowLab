import { createAgents } from './agents';
import { createAudio } from './audio';
import { createControls } from './controls';
import { createCrew } from './crew';
import { createOverlay } from './overlay';
import { createPeople } from './people';
import { slowWatch } from './pure';
import type { SceneCustomer } from './pure';
import { createRoom } from './room';
import { createStage } from './stage';

// Visual-only canteen. Layout, walking, chairs and eating never feed back into the model;
// the scene only mirrors which customer ids are waiting or in service.

export { SCENE_AVATAR_LIMIT } from './pure';
export type { SceneCustomer } from './pure';
export type SceneView = {
  c: number;
  live: boolean;
  runKey: string;
  speed: number;
  /** Sim time in seconds, and the run's arrival horizon; 0 before a run starts. */
  clock: number;
  horizon: number;
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

/** `onTooSlow` fires once if most recent frames are mostly below ~8 fps, e.g. software WebGL on a weak device. */
export function createCanteen(host: HTMLElement, onContextLost: () => void, onTooSlow: (() => void) | null = null): CanteenScene {
  // Creation order is draw order: lights and world, the building, the counters group, then the people.
  const s = createStage(host, onContextLost);
  const people = createPeople(s);
  const room = createRoom(s, people.mats);
  const audio = createAudio(s);
  const crew = createCrew(s, people, room);
  const overlay = createOverlay(s);
  const agents = createAgents(s, people, audio.shot);
  let last: SceneView | null = null, C = 0;
  const controls = createControls(s, room.setWalk, () => last);

  function update(view: SceneView) {
    last = view;
    // Agents clear first so their chairs are free before the counter row is rebuilt.
    if (view.c !== C) { C = view.c; agents.setCounters(C); crew.setCounters(C); overlay.setCounters(C); }
    audio.sync(view.sound);
    view.serving.forEach((u, i) => { crew.setBusy(i, !!u); overlay.setBusy(i, !!u); });
    agents.sync(view);
  }

  const tooSlow = slowWatch();
  let raf = 0, prev = performance.now(), wasHidden = false;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    const gap = now - prev;
    prev = now;
    if (document.hidden || !s.size.w) { wasHidden = true; return; }
    // Gaps spanning a hidden period are not rendering cost.
    if (onTooSlow && !wasHidden && tooSlow(gap)) { const notify = onTooSlow; onTooSlow = null; notify(); }
    wasHidden = false;
    const walking = controls.frame(dt);
    const walkers = agents.frame(dt, now) + crew.frame(dt);
    room.frame(now, dt, walking);
    audio.frame(dt, walking, controls.tgt, walkers, agents.chairs);
    overlay.frame();
    s.renderer.render(s.scene, s.camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      audio.dispose();
      controls.dispose();
      crew.dispose();
      agents.dispose();
      overlay.dispose();
      s.dispose();
    },
  };
}
