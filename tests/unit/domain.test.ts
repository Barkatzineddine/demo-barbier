// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, atTime, hhmm, overlaps, startOfWeek, weekday } from '../../src/domain/dates';
import { easterSunday, holiday } from '../../src/domain/holidays';
import { bookingToIcs } from '../../src/domain/ics';
import { stateSchema } from '../../src/domain/schema';
import { seed } from '../../src/domain/seed';
import { checkPlacement, endOf } from '../../src/domain/slots';
import { TUESDAY, booking } from './fixtures';

describe('dates', () => {
  it('adds days across months and daylight saving changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // DST starts on 29 March in France
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19'); // a Sunday
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
    expect(weekday('2026-10-19')).toBe(1);
  });
  it('formats minutes and detects overlaps (touching is not overlapping)', () => {
    expect(hhmm(545)).toBe('09:05');
    expect(overlaps(600, 630, 630, 660)).toBe(false);
    expect(overlaps(600, 631, 630, 660)).toBe(true);
    expect(atTime('2030-01-08', 615).getHours()).toBe(10);
  });
});

describe('French public holidays', () => {
  it.each([[2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'], [2038, '2038-04-25']])('Easter %i is %s', (year, iso) => {
    expect(easterSunday(year)).toBe(iso);
  });
  it('derives the moving holidays from Easter', () => {
    expect(holiday('2026-04-06')).toBe('easterMonday');
    expect(holiday('2026-05-14')).toBe('ascension');
    expect(holiday('2026-05-25')).toBe('whitMonday');
  });
  it('knows the fixed ones and nothing else', () => {
    expect(holiday('2026-07-14')).toBe('bastille');
    expect(holiday('2026-11-11')).toBe('armistice');
    expect(holiday('2026-04-07')).toBeNull();
  });
});

describe('seed data', () => {
  const now = new Date(2026, 9, 23, 12, 0);
  const state = seed(now);

  it('passes the same validation as data loaded from storage', () => {
    expect(stateSchema.safeParse(state).success).toBe(true);
  });
  it('is deterministic for a given day', () => {
    expect(seed(now)).toEqual(state);
  });
  it('never double-books a barber and respects hours, days off and breaks', () => {
    const live = state.bookings.filter((b) => b.status !== 'cancelled');
    expect(live.length).toBeGreaterThan(500);
    for (const b of live) expect(checkPlacement(state, b, b.id), `${b.date} ${hhmm(b.start)}-${hhmm(endOf(b))} ${b.barber}`).toBeNull();
  });
  it('has no future booking marked as done', () => {
    expect(state.bookings.some((b) => b.status === 'done' && atTime(b.date, b.start) > now)).toBe(false);
  });
});

describe('iCalendar export', () => {
  it('produces a valid event with escaped text', () => {
    const ics = bookingToIcs(booking({ date: TUESDAY, start: 600, service: 'coupe-barbe' }), 'Coupe, barbe; soin', new Date(Date.UTC(2030, 0, 1)));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTART:20300108T100000');
    expect(lines).toContain('DTEND:20300108T105000');
    expect(lines).toContain('DTSTAMP:20300101T000000Z');
    expect(ics).toContain('SUMMARY:Coupe\\, barbe\\; soin');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
  });
});
