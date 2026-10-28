import type { GestureReply } from './gesture.worker';
import type { Sample } from './gate';

export type CameraStatus = 'requesting' | 'loading' | 'running' | 'error';
export type CameraHandlers = { onStatus: (status: CameraStatus, message?: string) => void; onSample: (sample: Sample) => void };

const FRAME_MS = 100;

/** Error text for the panel; never re-prompts on its own (PRD §11.1). */
function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Izin kamera ditolak. Semua kontrol manual tetap tersedia.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Kamera tidak ditemukan. Semua kontrol manual tetap tersedia.';
  if (name === 'NotReadableError') return 'Kamera sedang dipakai aplikasi lain. Semua kontrol manual tetap tersedia.';
  return 'AirShift belum aktif. Semua kontrol manual tetap tersedia.';
}

/**
 * Opt-in camera: video only, ~10 FPS, at most one frame in flight to the inference worker.
 * `stop()` ends every track, the capture loop and the worker; a permission or model that resolves
 * after stop() is discarded and its tracks are stopped at once.
 */
export function startCamera(video: HTMLVideoElement, handlers: CameraHandlers) {
  let stopped = false;
  let stream: MediaStream | null = null;
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    worker?.terminate();
    worker = null;
    video.srcObject = null;
  }

  function fail(message: string) {
    stop();
    handlers.onStatus('error', message);
  }

  async function capture() {
    if (stopped || !worker) return;
    timer = setTimeout(capture, FRAME_MS);
    if (inFlight || video.readyState < 2) return;
    inFlight = true;
    try {
      const bitmap = await createImageBitmap(video);
      if (stopped || !worker) { bitmap.close(); return; }
      worker.postMessage({ type: 'frame', bitmap, at: performance.now() }, [bitmap]);
    } catch {
      inFlight = false;
    }
  }

  (async () => {
    handlers.onStatus('requesting');
    let granted: MediaStream;
    try {
      granted = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
    } catch (error) {
      if (!stopped) fail(cameraError(error));
      return;
    }
    if (stopped) { granted.getTracks().forEach(track => track.stop()); return; }
    stream = granted;
    // A camera unplugged or revoked mid-run turns AirShift off; the simulation is untouched.
    granted.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (!stopped) fail('Kamera terputus. AirShift dimatikan; run tidak berubah.'); }));
    video.srcObject = granted;
    await video.play().catch(() => {});
    handlers.onStatus('loading');
    worker = new Worker(new URL('./gesture.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = () => fail('Model pengenalan tangan gagal dimuat. AirShift dimatikan.');
    worker.onmessage = (event: MessageEvent<GestureReply>) => {
      if (stopped) return;
      const reply = event.data;
      if (reply.type === 'ready') { handlers.onStatus('running'); void capture(); }
      else if (reply.type === 'error') fail(`Pengenalan tangan berhenti: ${reply.message}`);
      else { inFlight = false; handlers.onSample(reply); }
    };
  })();

  return { stop };
}
