import { describe, expect, it } from 'vitest';
import { CHIP_H, CHIP_W, WAIT_LONG, WAIT_OK, decayHeat, doing, nearestSlot, pickLookAt, placeChips, waitTone, who } from './insight';
import { SLOT } from './pure';

describe('wait chips', () => {
  it('bands waits into fine, getting long and long', () => {
    expect(waitTone(0)).toBe('ok');
    expect(waitTone(WAIT_OK - 0.1)).toBe('ok');
    expect(waitTone(WAIT_OK)).toBe('warn');
    expect(waitTone(WAIT_LONG - 0.1)).toBe('warn');
    expect(waitTone(WAIT_LONG)).toBe('long');
  });
  it('keeps the longest waits when chips would overlap', () => {
    const kept = placeChips([
      { id: 'short', x: 100, y: 100, wait: 10 },
      { id: 'long', x: 110, y: 104, wait: 200 },
      { id: 'apart', x: 110 + CHIP_W + 2, y: 100, wait: 5 },
      { id: 'below', x: 110, y: 104 + CHIP_H + 2, wait: 1 },
    ]);
    expect(kept.map(b => b.id)).toEqual(['long', 'apart', 'below']);
  });
});

describe('queue heatmap', () => {
  it('finds the lane slot a customer stands on, and none off the lane', () => {
    const [x, z] = SLOT(13);
    expect(nearestSlot(x + 0.3, z - 0.2)).toBe(13);
    expect(nearestSlot(12, 12)).toBe(-1);
  });
  it('rises toward 1 while a slot is occupied and fades once it is empty', () => {
    const heat = [0, 0];
    for (let i = 0; i < 40; i++) decayHeat(heat, new Set([0]), 1, 8);
    expect(heat[0]).toBeGreaterThan(0.99);
    expect(heat[1]).toBe(0);
    decayHeat(heat, new Set(), 8, 8);
    expect(heat[0]).toBeCloseTo(Math.exp(-1), 1);
  });
  it('does not depend on how the time is sliced', () => {
    const a = [0], b = [0];
    decayHeat(a, new Set([0]), 2, 8);
    for (let i = 0; i < 8; i++) decayHeat(b, new Set([0]), 0.25, 8);
    expect(a[0]).toBeCloseTo(b[0], 9);
  });
});

describe('look-at card', () => {
  it('picks whoever is nearest the middle of the view and within reach', () => {
    expect(pickLookAt([{ x: 0.3, y: 0, d: 2 }, { x: 0.05, y: 0.05, d: 3 }, { x: 0, y: 0, d: 9 }])).toBe(1);
  });
  it('picks nobody when everyone is off-centre or too far', () => {
    expect(pickLookAt([{ x: 0.6, y: 0, d: 1 }, { x: 0, y: 0, d: 5 }])).toBe(-1);
    expect(pickLookAt([])).toBe(-1);
  });
  it('names customers and says what they are doing', () => {
    expect(who('a:12')).toBe('Pelanggan 12');
    expect(who('m:3')).toBe('Tambahan manual 3');
    expect(doing('queue', 75)).toBe('Menunggu 01:15');
    expect(doing('queue', null)).toBe('Mengantre');
    expect(doing('eat', 10)).toBe('Sedang makan');
    expect(doing('exit', null)).toBe('Selesai, keluar');
  });
});
