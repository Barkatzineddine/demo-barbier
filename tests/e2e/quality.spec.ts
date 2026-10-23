import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { booking, expect, loginStaff, nextThursday, test, seedState } from './fixtures';

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
const serious = (r: Awaited<ReturnType<typeof axe>>) =>
  r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  for (const [name, path] of [['home', './'], ['booking', './#/reserver'], ['account', './#/compte'], ['staff login', './#/equipe']] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(1000); // entrance animations
      expect(serious(await axe(page))).toEqual([]);
    });
  }

  for (const tab of ['agenda', 'list', 'stats', 'messages', 'closures']) {
    test(`staff ${tab}`, async ({ page }) => {
      await loginStaff(page);
      await page.goto(`./#/equipe?tab=${tab}`);
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await page.waitForTimeout(800);
      expect(serious(await axe(page))).toEqual([]);
    });
  }
});

test.describe('security', () => {
  test('ships a strict CSP with Trusted Types', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  test.describe('with the violation expected', () => {
    test.use({ allowedConsole: /TrustedHTML|Trusted Type/ });
    test('the browser refuses raw HTML injection', async ({ page }) => {
      await page.goto('./');
      const result = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-properties -- this test proves the browser blocks it
        try { document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>'; return 'allowed'; } catch { return 'blocked'; }
      });
      expect(result).toBe('blocked');
    });
  });

  test('tampered storage is shown as text, never run', async ({ page }) => {
    const payload = '<img src=x onerror="window.pwned=1">';
    await seedState(page, { bookings: [booking({ date: nextThursday(), start: 600, name: payload })] });
    await loginStaff(page);
    await page.goto(`./#/equipe?tab=agenda&d=${nextThursday()}`);
    await expect(page.locator('.bk-name').first()).toHaveText(payload);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });

  test('invalid stored data is replaced by fresh demo data', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => localStorage.setItem('corbin:v2', JSON.stringify({ v: 2, bookings: 'oops', admin: true })));
    await page.reload();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('corbin:v2') ?? '{}') as { bookings: unknown[]; admin?: boolean });
    expect(stored.bookings.length).toBeGreaterThan(100);
    expect(stored.admin).toBeUndefined();
  });
});

test('works offline once visited (service worker)', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'same code path as desktop');
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Le geste précis');
  await page.getByRole('link', { name: 'Réserver un créneau' }).click(); // lazy-loaded screen, precached
  await expect(page.getByRole('heading', { name: '1. Choisissez une prestation' })).toBeVisible();
  await context.setOffline(false);
});
