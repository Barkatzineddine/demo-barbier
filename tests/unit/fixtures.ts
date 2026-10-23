import type { Booking, State } from '../../src/domain/schema';

/** An empty, valid state: tests add exactly what they need. */
export const emptyState = (): State => ({ v: 2, bookings: [], messages: [], closures: [], clients: [] });

let n = 0;
export function booking(partial: Partial<Booking> & Pick<Booking, 'date' | 'start'>): Booking {
  n += 1;
  return {
    id: `bTEST${n}`, code: 'MC-ABCDE', service: 'coupe', barber: 'karim', status: 'confirmed',
    name: 'Test Client', phone: '06 12 34 56 78', email: '', note: '', source: 'online', created: '2030-01-01T08:00:00.000Z',
    ...partial,
  };
}

// Fixed calendar used across tests (2030-01-07 is a Monday, 2030-01-08 a Tuesday).
export const MONDAY = '2030-01-07';
export const TUESDAY = '2030-01-08';
export const WEDNESDAY = '2030-01-09';
export const BEFORE_OPENING = new Date(2030, 0, 1, 8, 0);
