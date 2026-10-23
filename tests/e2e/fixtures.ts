// Shared Playwright fixtures: every test fails on a console error or an uncaught exception, so a CSP
// or Trusted Types violation anywhere in a flow is caught, not just the flows written to look for it.
import { test as base, expect, type Page } from '@playwright/test';
import { holiday } from '../../src/domain/holidays';
import type { Booking, State } from '../../src/domain/schema';

export const test = base.extend<{ allowedConsole: RegExp | null; consoleErrors: string[] }>({
  allowedConsole: [null, { option: true }],
  // a first visit starts on the inert pre-rendered copy (build/prerender.ts): navigations wait until the
  // app has replaced it, as a person would, unless a test asks to look at the copy (waitUntil: 'commit')
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    const live = async (waitUntil?: string) => { if (waitUntil !== 'commit') await page.locator('[data-prerendered]').waitFor({ state: 'detached' }); };
    page.goto = async (url, options) => { const response = await goto(url, options); await live(options?.waitUntil); return response; };
    page.reload = async (options) => { const response = await reload(options); await live(options?.waitUntil); return response; };
    await use(page);
  },
  // auto: attached to every test without being asked for
  consoleErrors: [async ({ page, allowedConsole }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !(allowedConsole?.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
    await use(errors);
    expect(errors, 'console errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next Thursday at least two days away that is not a public holiday: all three barbers work. */
export function nextThursday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 4 || holiday(isoDate(d))) d.setDate(d.getDate() + 1);
  return isoDate(d);
}

export function booking(over: Partial<Booking> & Pick<Booking, 'date' | 'start'>): Booking {
  return {
    id: 'bE2E0001', code: 'MC-E2EAB', service: 'coupe', barber: 'karim', status: 'confirmed', name: 'Test Client',
    phone: '06 12 34 56 78', email: '', note: '', source: 'online', created: new Date().toISOString(), ...over,
  };
}

/** Replace the demo data with a known state (the app validates it like any stored data). */
export async function seedState(page: Page, state: Partial<State>): Promise<void> {
  await page.goto('./');
  await page.evaluate((s) => {
    localStorage.setItem('corbin:v2', JSON.stringify({ v: 2, bookings: [], messages: [], closures: [], clients: [], ...s }));
  }, state);
  await page.reload();
}

/** Staff login with the public demo accounts. Local preview only: never run against the live site. */
export async function loginStaff(page: Page, role: 'manager' | 'barber' = 'manager'): Promise<void> {
  await page.goto('./#/equipe');
  await page.locator('.demo-logins button').nth(role === 'manager' ? 0 : 1).click();
  await page.locator('form.login button[type=submit]').click();
  await expect(page.locator('.kpis')).toBeVisible();
}

/** The customer flow: service, no preference, first free time, details. Returns the booking code. */
export async function bookOnline(page: Page, name = 'Léa Martin', phone = '06 11 22 33 44'): Promise<string> {
  await page.goto('./#/reserver');
  await page.getByRole('button', { name: /Coupe homme/ }).click();
  await page.getByRole('button', { name: /Sans préférence/ }).click();
  await page.locator('.slot').first().click();
  await page.getByLabel('Nom et prénom').fill(name);
  await page.getByLabel('Téléphone mobile').fill(phone);
  await page.getByLabel(/J’accepte/).check();
  await page.waitForTimeout(2100); // the anti-bot guard refuses forms filled in under two seconds
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  return (await page.locator('.code').textContent()) ?? '';
}
