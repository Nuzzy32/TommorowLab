import { createWorkerRuntime } from './runtime';

type WorkerScope = {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
const scope = self as unknown as WorkerScope;

// MessageChannel queues a macrotask without the nested setTimeout clamp, so control messages
// from the main thread still get a turn between slices.
const tasks: (() => void)[] = [];
const channel = new MessageChannel();
channel.port1.onmessage = () => tasks.shift()?.();

const runtime = createWorkerRuntime(
  reply => scope.postMessage(reply),
  task => { tasks.push(task); channel.port2.postMessage(null); },
  () => performance.now(),
);
scope.onmessage = event => runtime.receive(event.data);
