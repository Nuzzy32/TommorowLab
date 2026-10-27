import { describe, expect, test } from 'vitest';
import { createPcg32, createStream, exponentialGap, serviceDuration, toUniform } from './rng';

test('PCG-XSH-RR matches all six reference outputs after seeding', () => {
  const next = createPcg32(42, 54);
  expect(Array.from({ length: 6 }, () => next())).toEqual([
    0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
  ]);
});

const vectors: [number, number, 0 | 1 | 2, number[]][] = [
  [0, 0, 0, [0xe4c14788, 0x379c6516, 0x5c4ab3bb, 0x601d23e0]],
  [0, 0, 1, [0x0f5deba9, 0x184296dd, 0x357643f4, 0xf8e84c31]],
  [0, 0, 2, [0x7aa10266, 0xfe1a2e6e, 0xa37c7f0c, 0x1f9a25c6]],
  [0, 19, 0, [0x9b6d4cd0, 0x2d08fc26, 0x243157b0, 0xa4dcde18]],
  [0, 19, 1, [0xa495d23f, 0x092af7bf, 0x08a62244, 0x3aa28006]],
  [0, 19, 2, [0xe188288b, 0x87fa5442, 0xab615cca, 0x5dc04f7f]],
  [2026, 0, 0, [0xbbc743b4, 0xe9f40ea7, 0x2828adaf, 0x608c60dc]],
  [2026, 0, 1, [0x31896c9d, 0xdcd45124, 0x7941e065, 0x2c7b521a]],
  [2026, 0, 2, [0x0ff74d18, 0x5802d880, 0x83787c69, 0x17e38e22]],
  [2026, 19, 0, [0x6f017ace, 0xb2a3e280, 0x320695d4, 0x33d19793]],
  [2026, 19, 1, [0xb6b05895, 0x2d9a4d9e, 0x6b31427b, 0x368906b5]],
  [2026, 19, 2, [0xd5ddc4a1, 0x1dc1b8b2, 0x00354065, 0xf05d7f9c]],
];

test.each(vectors)('stream seed=%i replication=%i domain=%i matches golden integers', (seed, r, domain, expected) => {
  const next = createStream(seed, r, domain);
  expect(expected.map(() => next())).toEqual(expected);
});

test('root 2026 transforms match golden arrival and both service domains', () => {
  const arrivalU = toUniform(createStream(2026, 0, 0)());
  const autoU = toUniform(createStream(2026, 0, 1)());
  const manualU = toUniform(createStream(2026, 0, 2)());
  expect(arrivalU).toBe(0.7335092845605686);
  expect(autoU).toBe(0.19350317807402462);
  expect(manualU).toBe(0.062367266160435975);
  expect(exponentialGap(arrivalU, 4)).toBeCloseTo(19.836238122893338, 12);
  expect(serviceDuration(autoU, 20, 40)).toBe(23.870063561480492);
  expect(serviceDuration(manualU, 20, 40)).toBe(21.24734532320872);
});

test('uint32 endpoints stay strictly inside the uniform interval', () => {
  expect(toUniform(0)).toBe(2 ** -33);
  expect(toUniform(0xffffffff)).toBe(1 - 2 ** -33);
  for (const u of [toUniform(0), toUniform(0xffffffff)]) {
    expect(exponentialGap(u, 20)).toBeGreaterThan(0);
    expect(Number.isFinite(exponentialGap(u, 20))).toBe(true);
    expect(serviceDuration(u, 1, 300)).toBeGreaterThan(1);
    expect(serviceDuration(u, 1, 300)).toBeLessThan(300);
  }
});

describe('boundary validation', () => {
  test.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid seed integer %s', (value) => {
    expect(() => createPcg32(value, 0)).toThrow(RangeError);
    expect(() => createPcg32(0, value)).toThrow(RangeError);
    expect(() => createStream(value, 0, 0)).toThrow(RangeError);
  });

  test('accepts safe PCG seed limits and uint32 stream maximum', () => {
    expect(Number.isInteger(createPcg32(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)())).toBe(true);
    expect(Number.isInteger(createStream(0xffffffff, 19, 2)())).toBe(true);
    expect(() => createStream(2 ** 32, 0, 0)).toThrow(RangeError);
  });

  test.each([NaN, Infinity, -1, 0.5, 20])('rejects replication index %s', (r) => {
    expect(() => createStream(2026, r, 0)).toThrow(RangeError);
  });

  test.each([NaN, Infinity, -1, 0.5, 3])('rejects domain %s at runtime', (domain) => {
    expect(() => createStream(2026, 0, domain as 0)).toThrow(RangeError);
  });

  test.each([NaN, Infinity, -Infinity, -1, 0.5, 2 ** 32])('rejects non-uint32 output %s', (z) => {
    expect(() => toUniform(z)).toThrow(RangeError);
  });

  test.each([NaN, Infinity, -Infinity, -1, 0, 1, 2])('rejects invalid uniform %s', (u) => {
    expect(() => exponentialGap(u, 4)).toThrow(RangeError);
    expect(() => serviceDuration(u, 20, 40)).toThrow(RangeError);
    expect(() => serviceDuration(u, 20, 20)).toThrow(RangeError);
  });

  test.each([NaN, Infinity, -Infinity, -1, 0, 20.1])('rejects invalid arrival rate %s', (lambda) => {
    expect(() => exponentialGap(0.5, lambda)).toThrow(RangeError);
  });

  test('rejects numeric overflow rather than returning a nonfinite gap', () => {
    expect(() => exponentialGap(0.5, Number.MIN_VALUE)).toThrow(RangeError);
  });

  test.each([[0, 40], [20, 301], [40, 20], [20.5, 40], [20, 40.5], [NaN, 40], [20, Infinity]])(
    'rejects invalid service bounds [%s, %s]', (a, b) => {
      expect(() => serviceDuration(0.5, a, b)).toThrow(RangeError);
    },
  );
});

test('separate stream consumption and repeated creation preserve deterministic outputs', () => {
  const expected = createStream(2026, 7, 1);
  const actual = createStream(2026, 7, 1);
  const manual = createStream(2026, 7, 2);
  for (let i = 0; i < 2000; i++) {
    manual();
    manual();
    expect(actual()).toBe(expected());
  }
});

test.each([0, 1, 2] as const)('fixed-seed stream %i passes uniform/service/gap distribution sanity checks', (domain) => {
  const next = createStream(2026, 0, domain);
  const n = 100_000;
  const values = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    const u = toUniform(next());
    expect(u > 0 && u < 1).toBe(true);
    values[0][i] = u;
    values[1][i] = serviceDuration(u, 20, 40);
    values[2][i] = exponentialGap(u, 4);
    expect(serviceDuration(u, 37, 37)).toBe(37);
  }
  const theoretical = [[0.5, 1 / 12], [30, 400 / 12], [15, 225]];
  for (let kind = 0; kind < values.length; kind++) {
    const samples = values[kind];
    const [mean, variance] = theoretical[kind];
    const actualMean = samples.reduce((sum, x) => sum + x, 0) / n;
    const actualVariance = samples.reduce((sum, x) => sum + (x - actualMean) ** 2, 0) / (n - 1);
    expect(Math.abs(actualMean - mean)).toBeLessThanOrEqual(5 * Math.sqrt(variance / n));
    expect(Math.abs(actualVariance - variance) / variance).toBeLessThanOrEqual(0.05);
  }
});
