/// <reference lib="webworker" />
import { GestureRecognizer } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import modelAssetPath from './gesture_recognizer.task?url';

// Hand-pose inference off the main thread (ARCHITECTURE §11.1). Model and Wasm come from this origin;
// frames arrive as transferred ImageBitmaps, are closed after use and never stored or sent anywhere.
export type GestureRequest = { type: 'frame'; bitmap: ImageBitmap; at: number };
export type GestureReply =
  | { type: 'ready' }
  | { type: 'result'; at: number; hands: number; gesture: string; score: number }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (reply: GestureReply) => scope.postMessage(reply);

const recognizer = GestureRecognizer.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
  baseOptions: { modelAssetPath, delegate: 'CPU' },
  runningMode: 'VIDEO',
  numHands: 2,
}).then(ready => { post({ type: 'ready' }); return ready; }, error => {
  post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  return null;
});

let lastTimestamp = 0;
scope.onmessage = async (event: MessageEvent<GestureRequest>) => {
  const { bitmap, at } = event.data;
  try {
    const model = await recognizer;
    if (!model) return;
    // MediaPipe needs strictly increasing timestamps in VIDEO mode.
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(at));
    const result = model.recognizeForVideo(bitmap, lastTimestamp);
    const top = result.gestures[0]?.[0];
    post({ type: 'result', at, hands: result.landmarks.length, gesture: top?.categoryName ?? 'None', score: top?.score ?? 0 });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
