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
  await expect(help).toContainText('1 dari 3');
  await help.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByRole('dialog', { name: 'Ubah skenario' })).toContainText('2 dari 3');
  await page.getByRole('button', { name: 'Berikutnya' }).click();
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

test('3D scene loads lazily, toggles to the compact view and back', async ({ page }) => {
  await open(page);
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
