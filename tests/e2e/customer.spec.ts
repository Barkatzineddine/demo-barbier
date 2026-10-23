import { bookOnline, expect, test } from './fixtures';

test('a customer books in four steps, gets a code, a calendar file and finds it again', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Réserver un créneau' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Réserver un créneau' })).toBeFocused(); // announced to screen readers
  await expect(page).toHaveTitle('Réserver · Maison Corbin');
  await page.getByRole('button', { name: /Coupe \+ barbe/ }).click();
  await page.getByRole('button', { name: /Sans préférence/ }).click();
  await page.locator('.slot').first().click();

  // validation happens before anything is saved
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
  await expect(page.getByLabel('Nom et prénom')).toBeFocused();
  await expect(page.getByText('Merci de cocher cette case.')).toBeVisible();

  await page.getByLabel('Nom et prénom').fill('Léa Martin');
  await page.getByLabel('Téléphone mobile').fill('+33 6 11 22 33 44');
  await page.getByLabel(/J’accepte/).check();
  await page.waitForTimeout(2100);
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();

  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  await expect(page).toHaveURL(/#\/rdv\/b[A-Z2-9]{8}$/); // its own address: survives a reload
  await page.reload();
  const code = (await page.locator('.code').textContent()) ?? '';
  expect(code).toMatch(/^MC-[A-Z2-9]{5}$/);

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Ajouter à mon agenda/ }).click()]);
  expect(file.suggestedFilename()).toMatch(/^rdv-maison-corbin-\d{4}-\d{2}-\d{2}\.ics$/);

  await page.getByRole('link', { name: 'Mes rendez-vous' }).click();
  await expect(page.getByText(code)).toBeVisible();
});

test('the same phone number cannot hold more than two upcoming online bookings', async ({ page }) => {
  await bookOnline(page, 'Hugo Petit', '06 55 44 33 22');
  await bookOnline(page, 'Hugo Petit', '06 55 44 33 22');
  await page.goto('./#/reserver');
  await page.getByRole('button', { name: /Coupe homme/ }).click();
  await page.getByRole('button', { name: /Sans préférence/ }).click();
  await page.locator('.slot').first().click();
  await page.getByLabel('Nom et prénom').fill('Hugo Petit');
  await page.getByLabel('Téléphone mobile').fill('06 55 44 33 22');
  await page.getByLabel(/J’accepte/).check();
  await page.waitForTimeout(2100);
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
  await expect(page.locator('.toast-err')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toHaveCount(0);
});

test('the site switches to English and remembers it', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Precise hands,');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Book a slot' })).toBeVisible();
});

test('the contact form keeps human messages and fools bots without storing theirs', async ({ page }) => {
  const messages = () => page.evaluate(() => (JSON.parse(localStorage.getItem('corbin:v2') ?? '{}') as { messages: unknown[] }).messages.length);
  const send = async (bot: boolean) => {
    await page.goto('./#contact');
    const form = page.locator('#contact form');
    await form.getByLabel('Nom et prénom').fill('Camille Roux');
    await form.getByLabel('E-mail').fill('camille@example.com');
    await form.getByLabel('Message').fill('Bonjour, avez-vous des créneaux le samedi matin ?');
    await form.getByRole('checkbox').check();
    // the honeypot is off-screen and hidden from assistive tech: only a script fills it
    if (bot) await form.locator('input[name=website]').evaluate((el: HTMLInputElement) => { el.value = 'https://spam.example'; });
    await page.waitForTimeout(2600);
    await form.getByRole('button', { name: /Envoyer/ }).click();
    await expect(page.locator('.toast', { hasText: 'Message envoyé' }).last()).toBeVisible();
  };
  const before = await (async () => { await page.goto('./'); return messages(); })();
  await send(false);
  expect(await messages()).toBe(before + 1);
  await send(true);
  expect(await messages()).toBe(before + 1);
});
