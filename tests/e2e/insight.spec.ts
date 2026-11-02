import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Scene data overlays: wait chips over queueing customers, hidden again by the "Data di scene" toggle.
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

async function fast3d(page: Page) {
  const fps = await page.evaluate(() => new Promise<number>(resolve => {
    if (!document.createElement('canvas').getContext('webgl2')) { resolve(0); return; }
    let frames = 0;
    const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(frames); };
    requestAnimationFrame(tick);
  }));
  test.skip(fps < 10, `3D path not usable here (${fps} fps)`);
}

test('waiting customers get wait chips that the "Data di scene" toggle hides', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
  await fast3d(page);
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await page.locator('#primary-action').click();
  await page.locator('.add-strip input').first().fill('20');
  await page.getByRole('button', { name: 'Tambahkan' }).click();
  const chips = page.locator('.scene-wait-chip:not([hidden])');
  await expect.poll(() => chips.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(chips.first()).toHaveText(/^\d\d:\d\d$/);
  const toggle = page.getByRole('button', { name: 'Data di scene' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.scene-insight')).toBeHidden();
});
