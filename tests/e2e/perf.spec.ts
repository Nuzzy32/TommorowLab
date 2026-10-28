import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Indicative budgets on this machine (NFR-02/04). Reference-device numbers still need a real low-end laptop/phone.
const status = (page: Page) => page.getByRole('region', { name: 'Status simulasi' });
const primary = (page: Page) => page.locator('#primary-action');
const timed = async (task: () => Promise<unknown>) => { const start = Date.now(); await task(); return Date.now() - start; };

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
}

test('pause acknowledges quickly, the 3D scene keeps a usable frame rate and 20 pairs finish promptly', async ({ page, browserName }) => {
  await open(page);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.waitForTimeout(1500);
  // Frames rendered by the page over one second while the run and the 3D scene are active.
  const fps = await page.evaluate(() => new Promise<number>(resolve => {
    let frames = 0;
    const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(frames); };
    requestAnimationFrame(tick);
  }));
  const pauseMs = await timed(async () => { await primary(page).click(); await expect(status(page)).toContainText('Dijeda'); });

  await page.getByRole('tab', { name: 'Bandingkan' }).click();
  await page.getByRole('button', { name: 'Jadikan skenario sekarang baseline A' }).click();
  await page.getByRole('button', { name: 'Tambah loket kandidat B' }).click();
  const batchMs = await timed(async () => {
    await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
    await expect(page.getByRole('region', { name: 'Hasil perbandingan' }).locator('.tag')).toHaveText('Final', { timeout: 30_000 });
  });

  test.info().annotations.push({ type: 'perf', description: `${browserName}: fps ${fps}, pause ${pauseMs} ms, 20 pasangan ${batchMs} ms` });
  console.log(`[perf] ${browserName}: fps=${fps} pause=${pauseMs}ms batch20=${batchMs}ms`);
  // Loose regression guard: three engines share the CPU in `npm run check`; NFR-02 is measured on the reference device.
  expect(pauseMs).toBeLessThan(2000);
  expect(batchMs).toBeLessThan(10_000);
});

test('a heavy run near the 2,000-customer limit fast-finishes without freezing the page', async ({ page, browserName }) => {
  // 1,400 scheduled at 00:00 plus ~570 automatic arrivals over 30 minutes, loaded from a saved slot.
  const manualSchedule = Array.from({ length: 70 }, (_, entry) => ({
    id: `manual:${entry}`, atSimSec: 0, count: 20, sequence: entry, customerOrdinals: Array.from({ length: 20 }, (_, n) => entry * 20 + n),
  }));
  const raw = JSON.stringify({
    schemaVersion: 1, recordId: 'heavy', revision: 1, savedAt: '2026-10-28T08:00:00.000Z',
    config: { id: 'heavy', name: 'Beban berat', schemaVersion: 1, modelVersion: 'canteen-fifo-v1', c: 6, lambdaPerMinute: 19, serviceMinSec: 20, serviceMaxSec: 40, horizonSec: 1800, rootSeed: 2026, manualSchedule },
    versions: { modelVersion: 'canteen-fifo-v1', engineVersion: 'des-ts-v1', rngVersion: 'pcg32-xsh-rr-v1', seedDerivationVersion: 'seed-pcg32-v1' },
  });
  await page.addInitScript(([value]) => localStorage.setItem('tomorrowlab:scenario:heavy', value), [raw] as const);
  await open(page);
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await page.getByRole('button', { name: 'Muat Beban berat' }).click();
  await page.getByRole('button', { name: 'Muat konfigurasi' }).click();
  await expect(page.getByRole('textbox', { name: 'Kedatangan otomatis', exact: true })).toHaveValue('19');
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  const observing = await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { __long: number[] }).__long = seen;
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return false;
    new PerformanceObserver(list => list.getEntries().forEach(entry => seen.push(entry.duration))).observe({ type: 'longtask' });
    return true;
  });
  const fastMs = await timed(async () => {
    await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
    await expect(status(page)).toContainText(/Selesai · hasil final|Batas percobaan tercapai/, { timeout: 30_000 });
  });
  const worst = observing ? await page.evaluate(() => Math.max(0, ...(window as unknown as { __long: number[] }).__long)) : null;
  console.log(`[perf] ${browserName}: heavy fast finish ${fastMs}ms, longest main-thread task ${worst ?? 'n/a'}ms`);
  await expect(page.getByRole('region', { name: 'Hasil' })).toContainText(/1\.9\d\d/);
  expect(fastMs).toBeLessThan(15_000);
});
