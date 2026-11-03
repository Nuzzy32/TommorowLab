import * as THREE from 'three';
import type { Stage } from './stage';

// Daylight that tracks the run's phase: late-morning light when arrivals open, the sun crossing overhead while they
// stay open, warm afternoon light while the queue drains, golden evening light once the run is done.
// It is mood, not data: the model has no time of day, so no clock time is ever shown from this.

// Jakarta in early November: latitude and solar declination, degrees.
const LAT = -6.2, DECL = -15;
const RAD = Math.PI / 180;
// Visual hours: arrivals span 10:00 to 15:00, draining eases toward 17:00, a finished run sits at 17:15.
export const OPEN_HOUR = 10, CLOSE_HOUR = 15, DRAIN_HOUR = 17, DONE_HOUR = 17.25;
const DRAIN_TAU = 120;

export function dayHour(clock: number, horizon: number, done: boolean) {
  if (done) return DONE_HOUR;
  if (horizon <= 0) return OPEN_HOUR;
  if (clock <= horizon) return OPEN_HOUR + (CLOSE_HOUR - OPEN_HOUR) * Math.max(0, clock) / horizon;
  return CLOSE_HOUR + (DRAIN_HOUR - CLOSE_HOUR) * (1 - Math.exp(-(clock - horizon) / DRAIN_TAU));
}
// Solar elevation and azimuth (radians, azimuth clockwise from north) at a local solar hour.
export function sunAt(hour: number) {
  const h = (hour - 12) * 15 * RAD, phi = LAT * RAD, dec = DECL * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  const az = Math.atan2(-Math.sin(h) * Math.cos(dec), (Math.sin(dec) - Math.sin(el) * Math.sin(phi)) / Math.cos(phi));
  return { el, az };
}
// Scene axes: +x is east (the mushola faces -x, west), -z is north.
export const sunDir = ({ el, az }: { el: number; az: number }, out = new THREE.Vector3()) =>
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Low sun is warmer and dimmer; kept within a band so status colours stay readable.
export function sunLight(el: number) {
  const k = smooth(8 * RAD, 45 * RAD, el);
  return { sun: 1.3 + 0.65 * k, sky: 1.05 + 0.2 * k, warm: 1 - k };
}

export function createSky({ sun, hemi, reduced }: Stage) {
  const noonSun = new THREE.Color(0xfff6ea), lowSun = new THREE.Color('#FFC58A');
  const noonSky = new THREE.Color(0xffffff), lowSky = new THREE.Color('#FFE6CC');
  const dir = new THREE.Vector3();
  let want = OPEN_HOUR, hour = OPEN_HOUR;
  function apply() {
    const pos = sunAt(hour), light = sunLight(pos.el);
    sun.position.copy(sunDir(pos, dir).multiplyScalar(32));
    sun.intensity = light.sun;
    sun.color.lerpColors(noonSun, lowSun, light.warm);
    hemi.intensity = light.sky;
    hemi.color.lerpColors(noonSky, lowSky, light.warm * 0.7);
  }
  apply();
  return {
    sync(view: { clock: number; horizon: number; done: boolean; live: boolean }) {
      want = view.live ? dayHour(view.clock, view.horizon, view.done) : OPEN_HOUR;
    },
    // Eases toward the target so a fast-forwarded run glides instead of jumping.
    frame(dt: number) {
      if (Math.abs(want - hour) < 1e-4) return;
      hour = reduced ? want : hour + (want - hour) * Math.min(1, dt * 1.5);
      apply();
    },
  };
}
