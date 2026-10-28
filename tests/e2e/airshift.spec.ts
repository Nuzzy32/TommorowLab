import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Chromium's fake camera shows a synthetic pattern without hands; real-hand accuracy is the manual gate (PRD §9.3).
test.skip(({ browserName }) => browserName !== 'chromium', 'fake camera flags are Chromium-only');

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // MediaPipe's Wasm writes TensorFlow Lite INFO lines to stderr, which surfaces as console.error.
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('INFO: ')) errors.push(message.text()); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

// Records every getUserMedia call and stream so tests can prove when the camera is requested and stopped.
async function spyCamera(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const spy = window as unknown as { __calls: MediaStreamConstraints[]; __streams: MediaStream[] };
    spy.__calls = []; spy.__streams = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      spy.__calls.push(constraints ?? {});
      const stream = await original(constraints);
      spy.__streams.push(stream);
      return stream;
    };
  });
}
const tracks = (page: Page) => page.evaluate(() =>
  (window as unknown as { __streams: MediaStream[] }).__streams.flatMap(stream => stream.getTracks().map(track => `${track.kind}:${track.readyState}`)));
const panel = (page: Page) => page.getByRole('complementary', { name: 'AirShift' });

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
}

test('FR-30 opt-in only after explanation, local model, video only, and Matikan stops every track', async ({ page }) => {
  await spyCamera(page);
  const hosts = new Set<string>();
  page.on('request', request => hosts.add(new URL(request.url()).host));
  await open(page);
  expect(await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls.length)).toBe(0);

  await page.getByRole('button', { name: 'AirShift' }).click();
  await expect(panel(page)).toContainText('Frame tidak dikirim atau disimpan oleh TomorrowLab.');
  expect(await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls.length)).toBe(0);
  await panel(page).getByRole('button', { name: 'Aktifkan AirShift' }).click();
  await expect(panel(page).getByRole('status')).toHaveText(/AirShift siap|Tangan belum terlihat/, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __calls: MediaStreamConstraints[] }).__calls)).toEqual([
    { video: { width: 320, height: 240, facingMode: 'user' }, audio: false },
  ]);
  expect(await tracks(page)).toEqual(['video:live']);
  await expect(page.getByRole('region', { name: 'Status simulasi' })).toContainText('Manual + AirShift');
  // NFR-11: only this origin is contacted, including for the Wasm runtime and the model.
  expect([...hosts]).toEqual(['127.0.0.1:4173']);

  await panel(page).getByRole('button', { name: 'Tutup panel AirShift' }).click();
  await expect(page.getByText('Kamera aktif')).toBeVisible();
  await page.getByRole('button', { name: 'Matikan' }).click();
  await expect(page.getByText('Kamera aktif')).toHaveCount(0);
  expect(await tracks(page)).toEqual(['video:ended']);
  await expect(page.getByRole('region', { name: 'Status simulasi' })).toContainText('Kontrol manual');
});

test('a hidden tab stops the camera and requires a new opt-in; manual control keeps working', async ({ page }) => {
  await spyCamera(page);
  await open(page);
  await page.locator('#primary-action').click();
  await page.getByRole('button', { name: 'AirShift' }).click();
  await panel(page).getByRole('button', { name: 'Aktifkan AirShift' }).click();
  await expect(panel(page).getByRole('status')).toHaveText(/AirShift siap|Tangan belum terlihat/, { timeout: 30_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(panel(page)).toContainText('Kamera dimatikan karena tab tidak aktif.');
  expect(await tracks(page)).toEqual(['video:ended']);
  await expect(page.getByRole('region', { name: 'Status simulasi' })).toContainText('Dijeda · tab tidak aktif');
  expect(await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls.length)).toBe(1);
});

test('a denied camera explains itself, never re-prompts on its own, and the run is unaffected', async ({ page }) => {
  await page.addInitScript(() => {
    const spy = window as unknown as { __calls: number };
    spy.__calls = 0;
    navigator.mediaDevices.getUserMedia = async () => { spy.__calls++; throw new DOMException('denied', 'NotAllowedError'); };
  });
  await open(page);
  await page.locator('#primary-action').click();
  await page.getByRole('button', { name: 'AirShift' }).click();
  await panel(page).getByRole('button', { name: 'Aktifkan AirShift' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText('Izin kamera ditolak. Semua kontrol manual tetap tersedia.');
  await expect(panel(page).getByRole('button', { name: 'Coba lagi' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __calls: number }).__calls)).toBe(1);
  await expect(page.getByRole('region', { name: 'Status simulasi' })).toContainText('Berjalan');
  await page.locator('#primary-action').click();
  await expect(page.getByRole('region', { name: 'Status simulasi' })).toContainText('Dijeda');
});
