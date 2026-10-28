import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Runs against the production build, so these also cover the bundled simulation worker.
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

const status = (page: Page) => page.getByRole('region', { name: 'Status simulasi' });
const timer = (page: Page) => status(page).locator('.timer');
const primary = (page: Page) => page.locator('#primary-action');
const metric = (page: Page, label: string) => page.locator('.metric').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).first().locator('.metric-value');

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
}

async function setField(page: Page, label: string, value: string) {
  const field = page.getByRole('textbox', { name: label, exact: true });
  await field.fill(value);
  await field.press('Enter');
}

// ST-01 fixture through the UI: c=1, λ=0, service 10 s, 1 minute, three customers at 00:00.
async function st01(page: Page) {
  await open(page);
  await page.getByRole('button', { name: 'Kurangi jumlah loket' }).click();
  await setField(page, 'Kedatangan otomatis', '0');
  await setField(page, 'Minimum', '10');
  await setField(page, 'Maksimum', '10');
  await setField(page, 'Durasi menerima pelanggan', '1');
  await page.locator('#entry-count').fill('3');
  await page.getByRole('button', { name: 'Tambah jadwal' }).click();
}

test('UF-01 opens a ready preset without login or camera, with skippable help', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('TomorrowLab — Laboratorium skenario');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  const help = page.getByRole('dialog', { name: 'Jalankan percobaan' });
  await expect(help).toContainText('1 dari 4');
  await help.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByRole('dialog', { name: 'Ubah skenario' })).toContainText('2 dari 4');
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByRole('dialog', { name: 'Bandingkan A/B' })).toContainText('4 dari 4');
  await page.getByRole('button', { name: 'Mulai mencoba' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(primary(page)).toBeFocused();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jam makan siang');
  await expect(status(page)).toContainText('Siap dijalankan');
  await expect(timer(page)).toHaveText('00:00');
  for (const [label, value] of [['Loket aktif', '2'], ['Kedatangan otomatis', '4'], ['Minimum', '20'], ['Maksimum', '40'], ['Durasi menerima pelanggan', '15'], ['Seed percobaan', '2026']]) {
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue(value);
  }
  await expect(page.getByRole('radio', { name: '20×' })).toBeChecked();
  await expect(page.getByText('Permintaan otomatis menyamai kapasitas rata-rata (ρ = 1,00)', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Bantuan' }).click();
  await expect(page.getByRole('dialog', { name: 'Jalankan percobaan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Asumsi', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Asumsi model' });
  await expect(dialog).toContainText('FIFO');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Asumsi', exact: true })).toBeFocused();
});

test('UF-04 keyboard run, contextual Space pause/resume and focus kept on the toggled button', async ({ page }) => {
  await open(page);
  await primary(page).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Berjalan');
  await expect(page.getByRole('textbox', { name: 'Loket aktif', exact: true })).toBeDisabled();
  await expect.poll(async () => timer(page).textContent()).not.toBe('00:00');

  await page.locator('#workspace-title').focus();
  await page.keyboard.press(' ');
  await expect(status(page)).toContainText('Dijeda');
  const paused = await timer(page).textContent();
  await page.waitForTimeout(400);
  await expect(timer(page)).toHaveText(paused!);
  await page.keyboard.press(' ');
  await expect(status(page)).toContainText('Berjalan');

  // Space on the button itself activates it once; the workspace shortcut must not toggle a second time.
  await primary(page).focus();
  await page.keyboard.press(' ');
  await expect(status(page)).toContainText('Dijeda');
  await expect(primary(page)).toHaveText('Lanjutkan');
  await expect(primary(page)).toBeFocused();

  await page.getByRole('radio', { name: '1×' }).check();
  await expect(page.getByRole('radio', { name: '1×' })).toBeChecked();
});

test('UF-02 rejects invalid input without clamping and focuses the first error on Jalankan', async ({ page }) => {
  await open(page);
  await setField(page, 'Maksimum', '10');
  const max = page.getByRole('textbox', { name: 'Maksimum', exact: true });
  await expect(page.getByText('Waktu maksimum harus ≥ minimum.')).toBeVisible();
  await expect(max).toHaveAttribute('aria-invalid', 'true');
  await setField(page, 'Seed percobaan', '1.000');
  await expect(page.getByText('Seed harus bilangan bulat 0–4294967295.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Seed percobaan', exact: true })).toHaveValue('1.000');

  await primary(page).click();
  await expect(max).toBeFocused();
  await expect(status(page)).toContainText('Siap dijalankan');

  await setField(page, 'Kedatangan otomatis', '1.5');
  await expect(page.getByRole('textbox', { name: 'Kedatangan otomatis', exact: true })).toHaveValue('1,5');
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: 'Tambah loket' }).click();
  await expect(page.getByRole('textbox', { name: 'Loket aktif', exact: true })).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Tambah loket' })).toBeDisabled();
  await expect(page.getByText('Maksimum 6 loket.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Status loket' }).getByRole('listitem')).toHaveCount(6);
});

test('ST-01 through the UI: scheduled customers, fast finish, final metrics, replay and reset', async ({ page }) => {
  await st01(page);
  await expect(page.getByText('1 entri · 3 pelanggan')).toBeVisible();
  await expect(page.getByText('Tidak ada pelanggan terjadwal.')).toHaveCount(0);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
  await expect(metric(page, 'Rata-rata tunggu final')).toHaveText('10,00 detik');
  await expect(metric(page, 'P95 tunggu')).toHaveText('20,00 detik');
  await expect(metric(page, 'Waktu di sistem')).toHaveText('20,00 detik');
  await expect(metric(page, 'Utilisasi loket')).toHaveText('50,0%');
  await expect(metric(page, 'Throughput')).toHaveText('3,00 pel/menit');
  await expect(metric(page, 'Antrean maksimum')).toHaveText('2 pelanggan');
  await expect(metric(page, 'Menyelesaikan sisa')).toHaveText('0,00 detik');
  await expect(page.locator('.queue-chart')).toContainText('puncak 2 pelanggan');
  await expect(page.getByText('Run selesai · 3 pelanggan')).toBeVisible();

  await expect(primary(page)).toHaveText('Ulangi run yang sama');
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
  await expect(metric(page, 'Rata-rata tunggu final')).toHaveText('10,00 detik');

  await page.getByRole('button', { name: 'Reset run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset run ini?' });
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(status(page)).toContainText('Selesai');
  await page.getByRole('button', { name: 'Reset run' }).click();
  await dialog.getByRole('button', { name: 'Reset run' }).click();
  await expect(status(page)).toContainText('Siap dijalankan');
  await expect(page.getByRole('textbox', { name: 'Seed percobaan', exact: true })).toHaveValue('2026');
  await expect(page.getByRole('list', { name: 'Jadwal pelanggan manual' })).toContainText('00:00');
});

test('UF-05 customers added while paused wait for resume and keep the worker timestamp', async ({ page }) => {
  await open(page);
  await setField(page, 'Kedatangan otomatis', '0');
  await primary(page).click();
  await expect.poll(async () => timer(page).textContent()).not.toBe('00:00');
  await primary(page).click();
  await expect(status(page)).toContainText('Dijeda');
  const at = await timer(page).textContent();
  await page.locator('#add-count').fill('3');
  await page.getByRole('button', { name: 'Tambahkan' }).click();
  await expect(page.locator('.stage-notice')).toHaveText(`3 pelanggan dicatat pada ${at}. Menunggu Lanjutkan, pada waktu jeda.`);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(`3 pelanggan dicatat pada ${at}. Menunggu Lanjutkan, pada waktu jeda.`);
  const log = page.getByRole('region', { name: 'Catatan pelanggan manual' });
  await expect(log).toContainText('Menunggu diproses saat lanjut');
  await expect(page.locator('.counts')).toContainText('Tiba0');

  await page.locator('#add-count').fill('21');
  await page.getByRole('button', { name: 'Tambahkan' }).click();
  await expect(page.getByText('Jumlah pelanggan harus bilangan bulat 1–20.')).toBeVisible();

  await primary(page).click();
  await expect(log).toContainText('Saat run');
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
  await expect(metric(page, 'Pelanggan')).toHaveText('3');
});

test('UF-03/UF-08 out-of-range schedule blocks the run; Ubah skenario resets into editing', async ({ page }) => {
  await open(page);
  await setField(page, 'Durasi menerima pelanggan', '2');
  await page.locator('#entry-minute').fill('1');
  await page.locator('#entry-second').fill('30');
  await page.getByRole('button', { name: 'Tambah jadwal' }).click();
  await setField(page, 'Durasi menerima pelanggan', '1');
  await expect(page.getByText('Di luar durasi')).toBeVisible();
  await primary(page).click();
  await expect(page.getByRole('button', { name: /Hapus jadwal 01:30/ })).toBeFocused();
  await expect(page.getByText('Ada jadwal di luar durasi menerima pelanggan', { exact: false })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.schedule .group-head')).toContainText('Kosong');

  await primary(page).click();
  await expect(status(page)).toContainText(/Berjalan|Selesai/);
  await page.getByRole('button', { name: 'Ubah skenario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset untuk mengubah skenario?' });
  await dialog.getByRole('button', { name: 'Reset dan edit' }).click();
  await expect(status(page)).toContainText('Siap dijalankan');
  await expect(page.getByRole('textbox', { name: 'Loket aktif', exact: true })).toBeFocused();
});

test('UF-15 a hidden tab pauses the run and requires an explicit resume', async ({ page }) => {
  await open(page);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(status(page)).toContainText('Dijeda · tab tidak aktif');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Dijeda karena tab tidak aktif. Lanjutkan saat siap.')).toBeVisible();
  const paused = await timer(page).textContent();
  await page.waitForTimeout(400);
  await expect(timer(page)).toHaveText(paused!);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
});

for (const width of [360, 640, 768, 1280]) {
  test(`layout at ${width} px keeps every core action reachable without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await primary(page).click();
    await expect(status(page)).toContainText('Berjalan');
    await expect(page.getByRole('button', { name: 'Tambahkan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Selesaikan cepat' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// Headless Linux Firefox has no WebGL2 and Linux WebKit renders in software at a few fps; both are
// covered by the fallback tests, so this one needs a usable GPU path.
async function skipWithoutFast3d(page: Page) {
  const fps = await page.evaluate(() => new Promise<number>(resolve => {
    if (!document.createElement('canvas').getContext('webgl2')) { resolve(0); return; }
    let frames = 0;
    const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(frames); };
    requestAnimationFrame(tick);
  }));
  test.skip(fps < 10, `3D path not usable here (${fps} fps)`);
}

test('3D scene loads lazily, toggles to the compact view and back', async ({ page }) => {
  await open(page);
  await skipWithoutFast3d(page);
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await expect(page.getByText('Memuat ruang 3D…')).toHaveCount(0);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.getByRole('button', { name: 'Tampilan ringkas' }).click();
  await expect(page.locator('.scene-canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Status loket' })).toBeVisible();
  await page.getByRole('button', { name: 'Tampilan 3D' }).click();
  await expect(page.locator('.scene-canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Putar kanan' }).click();
  await page.getByRole('button', { name: 'Reset tampilan' }).click();
});

test('a 3D view that renders too slowly falls back to the compact view; asking again keeps 3D', async ({ page }) => {
  test.skip(await page.evaluate(() => !document.createElement('canvas').getContext('webgl2')).catch(() => true), 'no WebGL2');
  // Simulate a weak device: every animation frame arrives 400 ms late.
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 400);
  });
  await open(page);
  await expect(page.getByText('Ruang 3D terlalu berat untuk perangkat ini.', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.scene-canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Status loket' })).toBeVisible();
  await page.getByRole('button', { name: 'Coba 3D lagi' }).click();
  await expect(page.locator('.scene-canvas')).toHaveCount(1);
  await page.waitForTimeout(4000);
  await expect(page.locator('.scene-canvas')).toHaveCount(1);
});

test('without WebGL the stage falls back to the compact view and the run still works', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await open(page);
  await expect(page.getByText('Ruang 3D tidak didukung perangkat ini.', { exact: false })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Status loket' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tampilan 3D' })).toHaveCount(0);
  await primary(page).click();
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
});

test('UF-09/10/11 A=B is identical, then a third counter gives a paired result and marks the old one', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Bandingkan' }).click();
  await expect(page.getByRole('heading', { name: 'Belum ada baseline A' })).toBeVisible();
  await page.getByRole('button', { name: 'Jadikan skenario sekarang baseline A' }).click();
  await expect(page.getByText('Belum ada parameter yang diubah · Skenario identik.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Loket aktif', exact: true }).last()).toHaveValue('2');

  await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
  const result = page.getByRole('region', { name: 'Hasil perbandingan' });
  await expect(result.getByText('Skenario identik', { exact: false })).toBeVisible();
  await expect(result).toContainText('[0,00; 0,00]');
  await expect(result.locator('.tag')).toHaveText('Final');

  await page.getByRole('button', { name: 'Tambah loket kandidat B' }).click();
  await expect(page.locator('.compare-diff')).toContainText('Loket: 2 → 3');
  await expect(result.locator('.tag')).toHaveText('Hasil dari konfigurasi sebelumnya');
  await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
  await expect(result.getByText('Waktu tunggu rata-rata B lebih rendah pada eksperimen ini.')).toBeVisible();
  await expect(result.locator('.tag')).toHaveText('Final');
  await result.getByText('Detail 20 pasangan').click();
  await expect(result.locator('.pair-details tbody tr')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('workspace tabs follow the ARIA tabs keyboard pattern', async ({ page }) => {
  await open(page);
  const sim = page.getByRole('tab', { name: 'Simulasi' });
  await sim.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Bandingkan' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Bandingkan' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Belum ada baseline A' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(sim).toBeFocused();
  await expect(sim).toHaveAttribute('aria-selected', 'true');
});

test('opening Bandingkan while running asks to pause first and keeps the run paused', async ({ page }) => {
  await open(page);
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.getByRole('tab', { name: 'Bandingkan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pause dan buka perbandingan?' });
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Pause dan buka' }).click();
  await expect(status(page)).toContainText('Dijeda');
  await expect(page.getByRole('tab', { name: 'Bandingkan' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Jadikan skenario sekarang baseline A' }).click();
  await expect(page.getByText('sumber A: snapshot run (dijeda)')).toBeVisible();
  await page.getByRole('button', { name: 'Kurangi loket kandidat B' }).click();
  await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
  await expect(page.getByRole('region', { name: 'Hasil perbandingan' }).locator('.tag')).toHaveText('Final');
  await page.getByRole('tab', { name: 'Simulasi' }).click();
  await expect(status(page)).toContainText('Dijeda');
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
});

test('a completed run can become baseline A from the results panel', async ({ page }) => {
  await st01(page);
  await primary(page).click();
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
  await page.getByRole('button', { name: 'Jadikan baseline A' }).click();
  await expect(page.getByText('sumber A: snapshot run (selesai · hasil final)')).toBeVisible();
  await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
  // λ=0 with a fixed schedule: every replication sees the same three customers.
  await expect(page.getByRole('region', { name: 'Hasil perbandingan' })).toContainText('Skenario identik');
});

// A valid stored record written straight into localStorage, as another tab or an older session would.
const record = (recordId: string, name: string, c = 2) => JSON.stringify({
  schemaVersion: 1, recordId, revision: 1, savedAt: `2026-10-2${recordId.length % 9}T08:00:00.000Z`,
  config: {
    id: recordId, name, schemaVersion: 1, modelVersion: 'canteen-fifo-v1', c, lambdaPerMinute: 4,
    serviceMinSec: 20, serviceMaxSec: 40, horizonSec: 900, rootSeed: 2026, manualSchedule: [],
  },
  versions: { modelVersion: 'canteen-fifo-v1', engineVersion: 'des-ts-v1', rngVersion: 'pcg32-xsh-rr-v1', seedDerivationVersion: 'seed-pcg32-v1' },
});
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Tersimpan' });

test('UF-12/13 save survives a refresh, loads back into READY and deletes only that slot', async ({ page }) => {
  await open(page);
  await setField(page, 'Kedatangan otomatis', '7,5');
  await setField(page, 'Seed percobaan', '99');
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await expect(drawer(page)).toContainText('Belum ada konfigurasi tersimpan');
  await drawer(page).getByRole('button', { name: 'Simpan konfigurasi' }).click();
  const save = page.getByRole('dialog', { name: 'Simpan konfigurasi' });
  await expect(save.getByRole('textbox', { name: 'Nama' })).toBeFocused();
  await expect(save.getByRole('textbox', { name: 'Nama' })).toHaveValue('Kantin · 2 loket');
  await save.getByRole('textbox', { name: 'Nama' }).fill('<b>Siang</b> ramai');
  await save.getByRole('button', { name: 'Simpan' }).click();
  await expect(drawer(page)).toContainText('Konfigurasi “<b>Siang</b> ramai” tersimpan di browser ini.');
  await expect(drawer(page).locator('b')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Jalankan percobaan' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Seed percobaan', exact: true })).toHaveValue('2026');
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await drawer(page).getByRole('button', { name: 'Muat <b>Siang</b> ramai' }).click();
  const confirm = page.getByRole('dialog', { name: 'Muat konfigurasi “<b>Siang</b> ramai”?' });
  await expect(confirm.getByRole('button', { name: 'Batal' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Muat konfigurasi' }).click();
  await expect(status(page)).toContainText('Siap dijalankan');
  await expect(timer(page)).toHaveText('00:00');
  await expect(page.getByRole('textbox', { name: 'Kedatangan otomatis', exact: true })).toHaveValue('7,5');
  await expect(page.getByRole('textbox', { name: 'Seed percobaan', exact: true })).toHaveValue('99');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('<b>Siang</b> ramai');
  await expect(page.getByRole('textbox', { name: 'Loket aktif', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await drawer(page).getByRole('button', { name: 'Hapus <b>Siang</b> ramai' }).click();
  await page.getByRole('dialog', { name: 'Hapus konfigurasi “<b>Siang</b> ramai”?' }).getByRole('button', { name: 'Hapus konfigurasi' }).click();
  await expect(drawer(page)).toContainText('Belum ada konfigurasi tersimpan');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('tomorrowlab:scenario:')))).toEqual([]);
});

test('ten slots are full: saving asks which slot to replace and confirms the overwrite', async ({ page }) => {
  await page.addInitScript(([records]) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    records.forEach(([id, raw]) => localStorage.setItem(`tomorrowlab:scenario:${id}`, raw));
  }, [Array.from({ length: 10 }, (_, index) => [`slot${index}`, record(`slot${index}`, `Slot ${index}`)])] as const);
  await open(page);
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await expect(drawer(page).getByRole('listitem')).toHaveCount(10);
  await drawer(page).getByRole('button', { name: 'Simpan konfigurasi' }).click();
  const save = page.getByRole('dialog', { name: 'Simpan konfigurasi' });
  await save.getByRole('textbox', { name: 'Nama' }).fill('Baru');
  await save.getByRole('button', { name: 'Simpan' }).click();
  await expect(save.getByText('Penyimpanan penuh: pilih konfigurasi untuk diganti atau hapus satu slot.')).toBeVisible();
  await save.getByRole('radio', { name: 'Slot 4' }).check();
  await save.getByRole('button', { name: 'Simpan' }).click();
  const confirm = page.getByRole('dialog', { name: 'Ganti konfigurasi tersimpan?' });
  await expect(confirm).toContainText('“Slot 4” diganti dengan “Baru”');
  await confirm.getByRole('button', { name: 'Ganti konfigurasi' }).click();
  await expect(drawer(page)).toContainText('Konfigurasi “Baru” tersimpan');
  await expect(drawer(page).getByRole('listitem')).toHaveCount(10);
  await expect(drawer(page)).not.toContainText('Slot 4');
});

test('FR-23 corrupt records stay listed but unloadable, and a blocked storage keeps the app running', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('tomorrowlab:scenario:broken', '{not json'));
  await open(page);
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await expect(drawer(page)).toContainText('Konfigurasi tidak dapat dimuat');
  await expect(drawer(page)).toContainText('Data rusak (bukan JSON yang sah). Record tidak diubah.');
  await expect(drawer(page).getByRole('button', { name: /^Muat/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tomorrowlab:scenario:broken'))).toBe('{not json');

  const blocked = await browser.newPage();
  const blockedErrors: string[] = [];
  blocked.on('pageerror', error => blockedErrors.push(error.message));
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await open(blocked);
  await blocked.getByRole('button', { name: 'Tersimpan' }).click();
  await expect(drawer(blocked)).toContainText('Simulasi tetap berjalan tanpa simpan lokal');
  await expect(drawer(blocked).getByRole('button', { name: 'Simpan konfigurasi' })).toBeDisabled();
  await blocked.keyboard.press('Escape');
  await primary(blocked).click();
  await expect(status(blocked)).toContainText('Berjalan');
  expect(blockedErrors).toEqual([]);
  await blocked.close();
});

test('a delete confirmed after another tab changed the slot is refused as a conflict', async ({ page, context }) => {
  await page.addInitScript(([raw]) => {
    if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('tomorrowlab:scenario:shared', raw); }
  }, [record('shared', 'Bersama')] as const);
  await open(page);
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await drawer(page).getByRole('button', { name: 'Hapus Bersama' }).click();
  const confirm = page.getByRole('dialog', { name: 'Hapus konfigurasi “Bersama”?' });
  await expect(confirm).toBeVisible();

  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(([raw]) => localStorage.setItem('tomorrowlab:scenario:shared', raw), [record('shared', 'Bersama diubah', 4)] as const);
  await other.close();

  await confirm.getByRole('button', { name: 'Hapus konfigurasi' }).click();
  await expect(drawer(page)).toContainText('Data tersimpan berubah di tab lain.');
  await expect(drawer(page)).toContainText('Bersama diubah');
  expect(await page.evaluate(() => localStorage.getItem('tomorrowlab:scenario:shared'))).toContain('Bersama diubah');
});
