import { booking, bookOnline, expect, loginStaff, nextThursday, test, seedState } from './fixtures';

test.describe('staff agenda', () => {
  const date = nextThursday();

  test('drag a booking to another barber and time, then undo', async ({ page }) => {
    await seedState(page, { bookings: [booking({ date, start: 600, barber: 'karim' })] });
    await loginStaff(page);
    await page.goto(`./#/equipe?tab=agenda&d=${date}`);

    const block = page.locator('.lane-karim .bk', { hasText: 'Test Client' });
    await block.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const from = await block.boundingBox();
    const target = await page.locator('.cal .lane-ines').boundingBox();
    const ppm = await page.locator('.cal').evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--ppm')));
    if (!from || !target) throw new Error('agenda not rendered');

    await page.mouse.move(from.x + from.width / 2, from.y + 4);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + 12, { steps: 4 }); // past the 6 px activation distance
    await page.mouse.move(target.x + target.width / 2, from.y + 4 + 60 * ppm, { steps: 12 });
    await expect(page.locator('.lane-ines .drop-indicator.ok')).toHaveText('11:00');
    await page.mouse.up();

    await expect(page.locator('.toast', { hasText: 'Déplacé au' })).toContainText('Inès');
    await expect(page.locator('.lane-ines .bk', { hasText: 'Test Client' })).toContainText('11:00');
    await page.locator('.toast-action').click();
    await expect(page.locator('.lane-karim .bk', { hasText: 'Test Client' })).toContainText('10:00');
  });

  test('refuses a drop on a break and leaves the booking in place', async ({ page }) => {
    await seedState(page, { bookings: [booking({ date, start: 600, barber: 'karim' })] });
    await loginStaff(page);
    await page.goto(`./#/equipe?tab=agenda&d=${date}`);
    const block = page.locator('.lane-karim .bk', { hasText: 'Test Client' });
    const pause = page.locator('.lane-karim .pause');
    await block.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const from = await block.boundingBox();
    const to = await pause.boundingBox();
    if (!from || !to) throw new Error('agenda not rendered');
    await page.mouse.move(from.x + from.width / 2, from.y + 4);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + 14, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
    await expect(page.locator('.drop-indicator.bad')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.toast-err')).toBeVisible();
    await expect(block).toContainText('10:00');
  });

  test('a barber only sees their own agenda and fewer tabs', async ({ page }) => {
    await loginStaff(page, 'barber');
    await expect(page.getByRole('tab')).toHaveText(['Agenda', 'Rendez-vous', 'Statistiques']);
    await expect(page.locator('.cal .lane-karim, .cal .lane-ines')).toHaveCount(0);
    await expect(page.locator('.cal .lane-theo').first()).toBeVisible();
  });

  test('command palette finds a booking by code and opens it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard shortcut');
    await seedState(page, { bookings: [booking({ date, start: 600, barber: 'theo', code: 'MC-FIND7' })] });
    await loginStaff(page);
    await page.keyboard.press('Control+K');
    await page.keyboard.type('find7');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /Test Client/ })).toBeVisible();
  });
});

test('a new online booking appears live in the staff tab, and the customer hears when it moves', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'two tabs side by side');
  await loginStaff(page);
  const customer = await context.newPage();
  await bookOnline(customer, 'Nina Lefèvre', '06 22 33 44 55');

  // staff tab: a toast from the other tab (BroadcastChannel), with a link to the day
  await page.bringToFront(); // background tabs are throttled
  const toast = page.locator('.toast', { hasText: 'Nouveau rendez-vous : Nina Lefèvre' });
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.locator('.toast-action').click();
  await page.getByRole('button', { name: /Nina Lefèvre/ }).click();

  // move it with the keyboard-friendly dialog
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Déplacer' }).click();
  const time = dialog.getByLabel('Heure');
  await time.selectOption((await time.locator('option').last().getAttribute('value')) ?? '');
  await dialog.getByRole('button', { name: 'Déplacer' }).click();

  await customer.bringToFront();
  await expect(customer.locator('.toast', { hasText: 'Votre rendez-vous a été déplacé' })).toBeVisible({ timeout: 10_000 });
});
