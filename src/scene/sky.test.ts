import { describe, expect, it } from 'vitest';
import { CLOSE_HOUR, DONE_HOUR, DRAIN_HOUR, OPEN_HOUR, dayHour, sunAt, sunDir, sunLight } from './sky';

const deg = (r: number) => r * 180 / Math.PI;

describe('run phase to daylight hour', () => {
  it('spans the open hours while arrivals are open', () => {
    expect(dayHour(0, 900, false)).toBe(OPEN_HOUR);
    expect(dayHour(450, 900, false)).toBeCloseTo((OPEN_HOUR + CLOSE_HOUR) / 2);
    expect(dayHour(900, 900, false)).toBe(CLOSE_HOUR);
  });
  it('eases toward late afternoon while the queue drains, never past it', () => {
    const a = dayHour(960, 900, false), b = dayHour(1500, 900, false), c = dayHour(1e6, 900, false);
    expect(a).toBeGreaterThan(CLOSE_HOUR);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeLessThanOrEqual(DRAIN_HOUR);
  });
  it('sits at evening once done, and at the opening hour without a run', () => {
    expect(dayHour(300, 900, true)).toBe(DONE_HOUR);
    expect(dayHour(0, 0, false)).toBe(OPEN_HOUR);
  });
});

describe('sun position for Jakarta in early November', () => {
  it('is up for the whole visual day and highest around noon, a little to the south', () => {
    for (let h = OPEN_HOUR; h <= DONE_HOUR; h += 0.25) expect(deg(sunAt(h).el)).toBeGreaterThan(5);
    const noon = sunAt(12);
    expect(deg(noon.el)).toBeCloseTo(81.2, 0);
    expect(sunDir(noon).z).toBeGreaterThan(0);
    expect(noon.el).toBeGreaterThan(sunAt(10).el);
    expect(noon.el).toBeGreaterThan(sunAt(15).el);
  });
  it('rises in the east and sets in the west', () => {
    expect(sunDir(sunAt(10)).x).toBeGreaterThan(0.3);
    expect(sunDir(sunAt(16)).x).toBeLessThan(-0.3);
    expect(sunDir(sunAt(13)).length()).toBeCloseTo(1, 9);
  });
});

describe('sun light', () => {
  it('is bright and neutral when high, warmer and dimmer when low, within a readable band', () => {
    const high = sunLight(80 * Math.PI / 180), low = sunLight(10 * Math.PI / 180);
    expect(high.warm).toBe(0);
    expect(low.warm).toBeGreaterThan(0.9);
    expect(low.sun).toBeLessThan(high.sun);
    for (const l of [high, low]) { expect(l.sun).toBeGreaterThanOrEqual(1.3); expect(l.sun).toBeLessThanOrEqual(1.95 + 1e-9); expect(l.sky).toBeGreaterThanOrEqual(1.05); }
  });
});
