import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// OS display preferences (DESIGN_SYSTEM §3.7). These prove the CSS reacts; a person still checks the look on real devices.
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

test('reduced motion zeroes UI transitions while the run clock and numbers keep updating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const help = page.getByRole('dialog', { name: 'Jalankan percobaan' });
  await expect(help).toBeVisible();
  expect(await help.evaluate(element => getComputedStyle(element).animationDuration)).toBe('0s');
  await page.getByRole('button', { name: 'Lewati' }).click();
  expect(await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.getByRole('button', { name: 'Tampilan ringkas' }).click();
  await primary(page).click();
  await expect(status(page)).toContainText('Berjalan');
  await expect(timer(page)).not.toHaveText('00:00');
});

test('reduced transparency gives solid panels without blur, and they pass axe contrast as rendered', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium implements prefers-reduced-transparency and its emulation');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Lewati' }).click();
  const panel = page.locator('.glass').first();
  const look = await panel.evaluate(element => {
    const style = getComputedStyle(element);
    return { blur: style.backdropFilter, background: style.backgroundColor, backdrop: getComputedStyle(document.querySelector('.backdrop')!).display };
  });
  expect(look.blur).toBe('none');
  expect(look.background).not.toContain('/');
  expect(look.background).toMatch(/^rgb\(/);
  expect(look.backdrop).toBe('none');
  // No style override here, unlike a11y.spec: with solid surfaces axe can resolve every background itself.
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).withRules(['color-contrast']).analyze();
  expect(violations.map(violation => `${violation.id} × ${violation.nodes.length}`)).toEqual([]);
});
