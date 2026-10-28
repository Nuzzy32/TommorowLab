import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Automated WCAG 2.2 A/AA rules on the main states; not a substitute for screen reader or manual review.
test.skip(({ browserName }) => browserName !== 'chromium', 'axe rules are engine independent; one engine keeps the suite fast');

// Glass panels sit on gradient fields that axe cannot resolve. Replace them with the darkest field colour
// and drop the blur so the translucent layers become measurable (worst case for text contrast).
async function audit(page: Page, label: string) {
  await page.addStyleTag({ content: '.backdrop{display:none!important} body{background:#bed6ec!important} *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = violations.map(violation => `${label}: ${violation.id} (${violation.impact}) × ${violation.nodes.length} — ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
  expect(summary).toEqual([]);
}

const primary = (page: Page) => page.locator('#primary-action');
const status = (page: Page) => page.getByRole('region', { name: 'Status simulasi' });

test('help dialog, ready workspace and assumptions drawer', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'help');
  await page.getByRole('button', { name: 'Lewati' }).click();
  await audit(page, 'ready');
  await page.getByRole('button', { name: 'Asumsi', exact: true }).click();
  await audit(page, 'assumptions');
});

test('paused run, final results, saved drawer and save dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await primary(page).click();
  await expect(status(page)).toContainText('Dijeda');
  await audit(page, 'paused');
  await page.getByRole('button', { name: 'Selesaikan cepat' }).click();
  await expect(status(page)).toContainText('Selesai · hasil final');
  await audit(page, 'final');
  await page.getByRole('button', { name: 'Tersimpan' }).click();
  await audit(page, 'saved drawer');
  await page.getByRole('dialog', { name: 'Tersimpan' }).getByRole('button', { name: 'Simpan konfigurasi' }).click();
  await audit(page, 'save dialog');
});

test('comparison result and compact scene on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
  await page.getByRole('button', { name: 'Tampilan ringkas' }).click();
  await audit(page, 'phone compact');
  await page.getByRole('tab', { name: 'Bandingkan' }).click();
  await page.getByRole('button', { name: 'Jadikan skenario sekarang baseline A' }).click();
  await page.getByRole('button', { name: 'Tambah loket kandidat B' }).click();
  await page.getByRole('button', { name: 'Jalankan 20 pasangan' }).click();
  await expect(page.getByRole('region', { name: 'Hasil perbandingan' }).locator('.tag')).toHaveText('Final');
  await page.getByText('Detail 20 pasangan').click();
  await audit(page, 'comparison');
});
