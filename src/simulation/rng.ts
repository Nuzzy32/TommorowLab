const UINT32_SIZE = 2 ** 32;
const MASK64 = (1n << 64n) - 1n;

function requireInteger(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  }
}

function requireUniform(u: number): void {
  if (!Number.isFinite(u) || u <= 0 || u >= 1) {
    throw new RangeError('Uniform variate must be finite and strictly between 0 and 1');
  }
}

export function createPcg32(initstate: number, initseq: number): () => number {
  requireInteger(initstate, 0, Number.MAX_SAFE_INTEGER, 'initstate');
  requireInteger(initseq, 0, Number.MAX_SAFE_INTEGER, 'initseq');
  let state = 0n;
  const increment = (BigInt(initseq) << 1n) | 1n;

  const next = (): number => {
    const old = state;
    state = (old * 6364136223846793005n + increment) & MASK64;
    const x = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rotation = Number(old >> 59n);
    return ((x >>> rotation) | (x << ((-rotation) & 31))) >>> 0;
  };

  next();
  state = (state + BigInt(initstate)) & MASK64;
  next();
  return next;
}

export function createStream(rootSeed: number, r: number, domain: 0 | 1 | 2): () => number {
  requireInteger(rootSeed, 0, UINT32_SIZE - 1, 'rootSeed');
  requireInteger(r, 0, 19, 'replicationIndex');
  requireInteger(domain, 0, 2, 'domain');
  return createPcg32(rootSeed, 3 * r + domain);
}

export function toUniform(z: number): number {
  requireInteger(z, 0, UINT32_SIZE - 1, 'z');
  return (z + 0.5) / UINT32_SIZE;
}

export function exponentialGap(u: number, lambdaPerMinute: number): number {
  requireUniform(u);
  if (!Number.isFinite(lambdaPerMinute) || lambdaPerMinute <= 0 || lambdaPerMinute > 20) {
    throw new RangeError('lambdaPerMinute must be finite and in (0, 20]');
  }
  const gap = -Math.log1p(-u) * 60 / lambdaPerMinute;
  if (!Number.isFinite(gap) || gap <= 0) {
    throw new RangeError('Exponential gap must be finite and positive');
  }
  return gap;
}

export function serviceDuration(u: number, a: number, b: number): number {
  requireUniform(u);
  requireInteger(a, 1, 300, 'serviceMinSec');
  requireInteger(b, a, 300, 'serviceMaxSec');
  return a === b ? a : a + (b - a) * u;
}
