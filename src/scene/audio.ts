import * as THREE from 'three';
import { FY, loopWindow } from './pure';
import type { Chair } from './pure';
import type { Stage } from './stage';

export type Clip = 'sizzle' | 'kitchen' | 'crowd' | 'footsteps' | 'tray' | 'register';
// [clip, x, z, refDistance, volume, seconds]: seconds is the loop file's audible length (see public/audio/CREDITS.md).
const LOOPS: [Clip, number, number, number, number, number][] = [
  ['sizzle', -3.6, -8.35, 1.6, 0.8, 34.0067], ['kitchen', 0, -7.4, 3, 0.6, 88.0013], ['crowd', 10.8, 2.5, 4, 0, 66], ['footsteps', 0, 1.0, 4, 0, 80],
];

// Real recordings placed in the room: walk to the kitchen and the sizzle gets louder. Loops start at a random point so
// reloads do not sound identical; a clip whose file is missing simply stays silent. Off until the viewer turns it on.
export function createAudio({ scene, camera }: Stage) {
  let listener: THREE.AudioListener | null = null, soundOn = false, lastShot = 0;
  const loops = new Map<Clip, THREE.PositionalAudio>(), shots: THREE.PositionalAudio[] = [], buffers = new Map<Clip, AudioBuffer>();
  const level = { crowd: 0, footsteps: 0 };
  function start() {
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
          const [from, to] = loopWindow(buf.duration, secs);
          a.setBuffer(buf);
          a.setLoopStart(from);
          a.setLoopEnd(to);
          a.offset = from + Math.random() * secs;
          a.play();
        }
      }).catch(() => {});
    });
  }
  function setSound(on: boolean) {
    soundOn = on;
    if (on && !listener) start();
    if (listener) void (on && !document.hidden ? listener.context.resume() : listener.context.suspend());
  }
  const onVisibility = () => { if (soundOn) setSound(true); };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    sync(on: boolean) { if (on !== soundOn) setSound(on); },
    shot(clip: Clip, x: number, z: number) {
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
    },
    frame(dt: number, walking: boolean, tgt: THREE.Vector3, walkers: number, chairs: Chair[]) {
      if (!listener) return;
      // The ear rides with the eye in walk mode; from above it sits a quarter of the way to the camera, so zooming in brings the room closer.
      if (walking) listener.position.copy(camera.position); else listener.position.lerpVectors(tgt, camera.position, 0.25);
      listener.quaternion.copy(camera.quaternion);
      const ease = Math.min(1, dt * 1.5);
      level.crowd += (0.2 + 0.8 * chairs.filter(c => c.busy).length / chairs.length - level.crowd) * ease;
      level.footsteps += (Math.min(1, walkers / 8) - level.footsteps) * ease;
      loops.get('crowd')?.setVolume(level.crowd);
      loops.get('footsteps')?.setVolume(level.footsteps * 0.7);
    },
    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      [...loops.values(), ...shots].forEach(a => { if (a.isPlaying) a.stop(); });
      if (listener) { scene.remove(listener); void listener.context.suspend(); listener = null; }
    },
  };
}
export type Audio = ReturnType<typeof createAudio>;
