// Availability engine: opening hours, each barber's days and break, holidays, closures and existing
// bookings. Pure functions over the state, so the same rules apply to customers, staff and tests.
import { BARBERS, HOURS, LEAD_MINUTES, STEP, barber, service, type BarberId, type ServiceId } from './catalog';
import { isoDate, minutesOf, overlaps, weekday } from './dates';
import { holiday, type HolidayId } from './holidays';
import type { Booking, State } from './schema';

export type DayInfo =
  | { open: true; from: number; to: number }
  | { open: false; reason: 'weekly' } | { open: false; reason: 'holiday'; holiday: HolidayId } | { open: false; reason: 'closure'; label: string };

export function dayInfo(state: Pick<State, 'closures'>, iso: string): DayInfo {
  const hours = HOURS[weekday(iso)];
  if (!hours) return { open: false, reason: 'weekly' };
  const h = holiday(iso);
  if (h) return { open: false, reason: 'holiday', holiday: h };
  const closure = state.closures.find((c) => c.date === iso);
  if (closure) return { open: false, reason: 'closure', label: closure.reason };
  return { open: true, from: hours[0], to: hours[1] };
}

export const worksOn = (barberId: BarberId, iso: string): boolean => barber(barberId).days.includes(weekday(iso));
export const endOf = (b: Pick<Booking, 'start' | 'service'>): number => b.start + service(b.service).minutes;

/** Busy intervals of one barber on a day: live bookings plus the break. */
export function busy(state: Pick<State, 'bookings'>, barberId: BarberId, iso: string, ignoreId?: string): [number, number][] {
  const list: [number, number][] = state.bookings
    .filter((b) => b.barber === barberId && b.date === iso && b.status !== 'cancelled' && b.id !== ignoreId)
    .map((b) => [b.start, endOf(b)]);
  list.push([...barber(barberId).pause]);
  return list;
}

export interface Slot { start: number; barber: BarberId }

/**
 * Free start times for a service on a day. barberId = null means "no preference": each start is
 * given to the free barber with the fewest bookings that day, which spreads the work.
 */
export function freeSlots(state: State, iso: string, serviceId: ServiceId, barberId: BarberId | null, now = new Date()): Slot[] {
  const info = dayInfo(state, iso);
  if (!info.open) return [];
  const duration = service(serviceId).minutes;
  const load = (id: BarberId) => state.bookings.filter((b) => b.barber === id && b.date === iso && b.status !== 'cancelled').length;
  const candidates = (barberId ? [barber(barberId)] : [...BARBERS])
    .filter((b) => worksOn(b.id, iso))
    .sort((a, b) => load(a.id) - load(b.id));
  const busyBy = new Map(candidates.map((b) => [b.id, busy(state, b.id, iso)]));
  const earliest = iso === isoDate(now) ? minutesOf(now) + LEAD_MINUTES : -1;
  const slots: Slot[] = [];
  for (let t = info.from; t + duration <= info.to; t += STEP) {
    if (t < earliest) continue;
    const who = candidates.find((b) => !(busyBy.get(b.id) ?? []).some(([s, e]) => overlaps(t, t + duration, s, e)));
    if (who) slots.push({ start: t, barber: who.id });
  }
  return slots;
}

export type PlacementError = 'closed' | 'outside-hours' | 'barber-off' | 'conflict';

/** Can this booking sit at (date, start, barber)? Used when booking and when staff drag a booking. */
export function checkPlacement(state: State, b: Pick<Booking, 'date' | 'start' | 'service' | 'barber'>, ignoreId?: string): PlacementError | null {
  const info = dayInfo(state, b.date);
  if (!info.open) return 'closed';
  if (b.start < info.from || endOf(b) > info.to) return 'outside-hours';
  if (!worksOn(b.barber, b.date)) return 'barber-off';
  if (busy(state, b.barber, b.date, ignoreId).some(([s, e]) => overlaps(b.start, endOf(b), s, e))) return 'conflict';
  return null;
}

/** Fill rate of the barbers' working time over a set of days (0..1), for all or some barbers. */
export function fillRate(state: State, days: string[], only?: BarberId): number {
  let capacity = 0, booked = 0;
  for (const iso of days) {
    const info = dayInfo(state, iso);
    if (!info.open) continue;
    for (const b of BARBERS) {
      if (only && b.id !== only) continue;
      if (!worksOn(b.id, iso)) continue;
      capacity += info.to - info.from - (b.pause[1] - b.pause[0]);
      booked += state.bookings
        .filter((x) => x.date === iso && x.barber === b.id && x.status !== 'cancelled')
        .reduce((m, x) => m + service(x.service).minutes, 0);
    }
  }
  return capacity ? booked / capacity : 0;
}
