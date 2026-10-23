import { beforeEach, describe, expect, it } from 'vitest';
import { addClosure, app, book, canCancel, cancelByCustomer, deleteMessage, moveBooking, removeClosure, sendMessage, setStatus, toggleRead, type NewBooking } from '../../src/state/app';
import { booking } from './fixtures';

// 2031-01-07 is a Tuesday: Karim and Inès work, Théo does not.
const DAY = '2031-01-07';
const request = (over: Partial<NewBooking> = {}): NewBooking => ({
  service: 'coupe', barber: 'karim', date: DAY, start: 600, name: 'Léa Martin', phone: '06 11 22 33 44', email: '', note: '', source: 'online', ...over,
});

beforeEach(() => {
  app.update((s) => { s.bookings = []; s.closures = []; });
});

describe('booking', () => {
  it('creates a confirmed booking with a readable code and a normalised phone', () => {
    const result = book(request({ phone: '+33611223344' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.code).toMatch(/^MC-[A-HJ-NP-Z2-9]{5}$/);
    expect(result.booking.phone).toBe('06 11 22 33 44');
    expect(app.get().bookings).toHaveLength(1);
  });

  it('re-checks the slot at the last moment (taken in another tab meanwhile)', () => {
    book(request({ phone: '06 99 99 99 99' }));
    expect(book(request())).toEqual({ ok: false, error: 'conflict' });
  });

  it('limits online customers to two upcoming bookings per phone number', () => {
    expect(book(request({ start: 600 })).ok).toBe(true);
    expect(book(request({ start: 660 })).ok).toBe(true);
    expect(book(request({ start: 720 }))).toEqual({ ok: false, error: 'phone-limit' });
    expect(book(request({ start: 720, source: 'phone' })).ok).toBe(true); // the staff can still book by phone
  });
});

describe('staff moves', () => {
  it('moves a booking to a free place and refuses an impossible one', () => {
    const a = book(request());
    const b = book(request({ start: 700, phone: '06 99 99 99 99' }));
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(moveBooking(a.booking.id, { date: DAY, start: 620, barber: 'ines' })).toBeNull();
    expect(app.get().bookings.find((x) => x.id === a.booking.id)).toMatchObject({ start: 620, barber: 'ines' });
    expect(moveBooking(a.booking.id, { date: DAY, start: 690, barber: 'karim' })).toBe('conflict');
    expect(moveBooking(a.booking.id, { date: DAY, start: 600, barber: 'theo' })).toBe('barber-off');
    expect(moveBooking(a.booking.id, { date: '2031-01-06', start: 600, barber: 'karim' })).toBe('closed');
  });
});

describe('customer cancellation', () => {
  const b = booking({ date: '2031-01-07', start: 600 });
  it('is allowed until two hours before', () => {
    expect(canCancel(b, new Date(2031, 0, 7, 7, 59))).toBe(true);
    expect(canCancel(b, new Date(2031, 0, 7, 8, 1))).toBe(false);
    expect(canCancel({ ...b, status: 'cancelled' }, new Date(2031, 0, 1))).toBe(false);
  });
});

describe('status, messages and closures', () => {
  it('lets a customer cancel in time, and the staff change a status', () => {
    const r = book(request());
    if (!r.ok) throw new Error('setup failed');
    expect(cancelByCustomer(r.booking.id)).toBe(true);
    expect(app.get().bookings[0]?.status).toBe('cancelled');
    expect(cancelByCustomer(r.booking.id)).toBe(false); // already cancelled
    setStatus(r.booking.id, 'confirmed');
    expect(app.get().bookings[0]?.status).toBe('confirmed');
  });

  it('keeps contact messages and lets the manager triage them', () => {
    app.update((s) => { s.messages = []; });
    sendMessage({ name: 'Camille', email: 'c@example.com', subject: 'Question', message: 'Bonjour' });
    const [m] = app.get().messages;
    expect(m).toMatchObject({ read: false, name: 'Camille' });
    toggleRead(m?.id ?? '');
    expect(app.get().messages[0]?.read).toBe(true);
    deleteMessage(m?.id ?? '');
    expect(app.get().messages).toHaveLength(0);
  });

  it('closes and reopens a day', () => {
    addClosure(DAY, 'Inventaire');
    expect(book(request())).toEqual({ ok: false, error: 'closed' });
    removeClosure(DAY);
    expect(book(request()).ok).toBe(true);
  });
});
