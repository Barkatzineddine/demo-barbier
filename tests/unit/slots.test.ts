// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HOURS, barber } from '../../src/domain/catalog';
import { checkPlacement, dayInfo, fillRate, freeSlots } from '../../src/domain/slots';
import { BEFORE_OPENING, MONDAY, TUESDAY, WEDNESDAY, booking, emptyState } from './fixtures';

const starts = (slots: { start: number }[]) => slots.map((s) => s.start);

describe('dayInfo', () => {
  it('is closed on the weekly closing day', () => {
    expect(dayInfo(emptyState(), MONDAY)).toEqual({ open: false, reason: 'weekly' });
  });
  it('uses the opening hours of the weekday', () => {
    expect(dayInfo(emptyState(), TUESDAY)).toEqual({ open: true, from: HOURS[2]?.[0], to: HOURS[2]?.[1] });
  });
  it('is closed on public holidays and on staff closures', () => {
    expect(dayInfo(emptyState(), '2030-05-01')).toEqual({ open: false, reason: 'holiday', holiday: 'labour' });
    const state = { ...emptyState(), closures: [{ date: TUESDAY, reason: 'Inventaire' }] };
    expect(dayInfo(state, TUESDAY)).toEqual({ open: false, reason: 'closure', label: 'Inventaire' });
  });
});

describe('freeSlots', () => {
  it('lists every 15-minute start that fits before closing', () => {
    const slots = starts(freeSlots(emptyState(), TUESDAY, 'coupe', 'karim', BEFORE_OPENING));
    expect(slots[0]).toBe(600);
    expect(slots.at(-1)).toBe(1170 - 30);
    expect(slots.every((s) => s % 15 === 0)).toBe(true);
  });

  it("keeps the barber's break free", () => {
    const [pauseStart, pauseEnd] = barber('karim').pause;
    const slots = starts(freeSlots(emptyState(), TUESDAY, 'coupe', 'karim', BEFORE_OPENING));
    expect(slots).toContain(pauseStart - 30);
    expect(slots).not.toContain(pauseStart - 15); // would run into the break
    expect(slots).not.toContain(pauseStart);
    expect(slots).toContain(pauseEnd);
  });

  it('returns nothing for a barber who does not work that day', () => {
    expect(freeSlots(emptyState(), TUESDAY, 'coupe', 'theo', BEFORE_OPENING)).toEqual([]);
  });

  it('skips taken times and gives "no preference" to the least busy barber', () => {
    const state = { ...emptyState(), bookings: [booking({ date: TUESDAY, start: 600, barber: 'karim' })] };
    expect(starts(freeSlots(state, TUESDAY, 'coupe', 'karim', BEFORE_OPENING))).not.toContain(600);
    const any = freeSlots(state, TUESDAY, 'coupe', null, BEFORE_OPENING);
    expect(any.find((s) => s.start === 600)?.barber).toBe('ines');
  });

  it('ignores cancelled bookings', () => {
    const state = { ...emptyState(), bookings: [booking({ date: TUESDAY, start: 600, status: 'cancelled' })] };
    expect(starts(freeSlots(state, TUESDAY, 'coupe', 'karim', BEFORE_OPENING))).toContain(600);
  });

  it('needs 30 minutes of notice on the same day', () => {
    const now = new Date(2030, 0, 8, 10, 0);
    expect(starts(freeSlots(emptyState(), TUESDAY, 'coupe', 'karim', now))[0]).toBe(630);
  });
});

describe('checkPlacement', () => {
  const state = { ...emptyState(), bookings: [booking({ id: 'bTAKEN', date: WEDNESDAY, start: 660, barber: 'karim', service: 'coupe-barbe' })] };
  it('accepts a free spot', () => {
    expect(checkPlacement(state, { date: WEDNESDAY, start: 600, service: 'coupe', barber: 'karim' })).toBeNull();
  });
  it.each([
    [{ date: MONDAY, start: 600 }, 'closed'],
    [{ date: WEDNESDAY, start: 1150 }, 'outside-hours'],
    [{ date: TUESDAY, start: 600, barber: 'theo' as const }, 'barber-off'],
    [{ date: WEDNESDAY, start: 690 }, 'conflict'],
  ])('refuses %o with %s', (place, error) => {
    expect(checkPlacement(state, { service: 'coupe', barber: 'karim', ...place })).toBe(error);
  });
  it('lets a booking move within its own time (it does not collide with itself)', () => {
    expect(checkPlacement(state, { date: WEDNESDAY, start: 675, service: 'coupe-barbe', barber: 'karim' }, 'bTAKEN')).toBeNull();
  });
});

describe('fillRate', () => {
  it('is booked minutes over working minutes, per barber or for everyone', () => {
    const state = { ...emptyState(), bookings: [booking({ date: TUESDAY, start: 600, barber: 'karim' })] };
    const [from, to] = HOURS[2] ?? [0, 0];
    const [p0, p1] = barber('karim').pause;
    expect(fillRate(state, [TUESDAY], 'karim')).toBeCloseTo(30 / (to - from - (p1 - p0)));
    expect(fillRate(state, [TUESDAY], 'theo')).toBe(0); // not working: no capacity
    expect(fillRate(state, [MONDAY])).toBe(0);
  });
});
