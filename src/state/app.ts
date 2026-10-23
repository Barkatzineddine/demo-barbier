// Application state and every mutation, in one place. Components never write the store directly.
import { CANCEL_LIMIT_MINUTES, MAX_UPCOMING_PER_PHONE, STAFF, type BarberId, type ServiceId, type StaffAccount } from '../domain/catalog';
import { atTime, isoDate } from '../domain/dates';
import { stateSchema, type Booking, type BookingStatus, type Client, type State } from '../domain/schema';
import { seed } from '../domain/seed';
import { checkPlacement, type PlacementError } from '../domain/slots';
import { hashPassword, normPhone, randomId, verifyPassword } from '../shared/security';
import { createPersistedStore } from '../shared/store';

export const STORE_KEY = 'corbin:v2';
export const app = createPersistedStore<State>(STORE_KEY, stateSchema, () => seed());
export const useApp = <T,>(selector: (s: State) => T): T => app.use((x) => selector(x.data));

// ---------- bookings ----------
export interface NewBooking { service: ServiceId; barber: BarberId; date: string; start: number; name: string; phone: string; email: string; note: string; source: 'online' | 'phone'; clientId?: string }

export type BookResult = { ok: true; booking: Booking } | { ok: false; error: PlacementError | 'phone-limit' };

export function book(input: NewBooking, now = new Date()): BookResult {
  const state = app.get();
  const phone = normPhone(input.phone);
  const upcoming = state.bookings.filter((b) => b.phone === phone && b.status === 'confirmed' && b.date >= isoDate(now));
  if (input.source === 'online' && upcoming.length >= MAX_UPCOMING_PER_PHONE) return { ok: false, error: 'phone-limit' };
  // re-checked at the last moment: another tab or the staff may have taken the slot meanwhile
  const error = checkPlacement(state, input);
  if (error) return { ok: false, error };
  const booking: Booking = {
    ...input, phone, id: randomId('b'), code: randomId('MC-', 5), status: 'confirmed', created: now.toISOString(),
  };
  app.update((s) => { s.bookings.push(booking); }, { type: 'booking.created', id: booking.id });
  return { ok: true, booking };
}

export const canCancel = (b: Booking, now = new Date()): boolean =>
  b.status === 'confirmed' && atTime(b.date, b.start).getTime() - now.getTime() >= CANCEL_LIMIT_MINUTES * 60_000;

export function cancelByCustomer(id: string): boolean {
  const b = app.get().bookings.find((x) => x.id === id);
  if (!b || !canCancel(b)) return false;
  app.update((s) => { const x = s.bookings.find((y) => y.id === id); if (x) x.status = 'cancelled'; }, { type: 'booking.cancelled', id });
  return true;
}

export function setStatus(id: string, status: BookingStatus): void {
  app.update((s) => { const x = s.bookings.find((y) => y.id === id); if (x) x.status = status; }, { type: 'booking.status', id, status });
}

/** Staff drag-and-drop or "move" dialog. Returns the reason when the new place is not possible. */
export function moveBooking(id: string, to: { date: string; start: number; barber: BarberId }): PlacementError | null {
  const state = app.get();
  const b = state.bookings.find((x) => x.id === id);
  if (!b) return 'conflict';
  const error = checkPlacement(state, { ...b, ...to }, id);
  if (error) return error;
  app.update((s) => { const x = s.bookings.find((y) => y.id === id); if (x) Object.assign(x, to); }, { type: 'booking.moved', id });
  return null;
}

// ---------- messages and closures ----------
export function sendMessage(m: { name: string; email: string; subject: string; message: string }): void {
  app.update((s) => { s.messages.unshift({ ...m, id: randomId('m'), read: false, at: new Date().toISOString() }); }, { type: 'message.received' });
}
export const toggleRead = (id: string) => app.update((s) => { const m = s.messages.find((x) => x.id === id); if (m) m.read = !m.read; });
export const deleteMessage = (id: string) => app.update((s) => { s.messages = s.messages.filter((x) => x.id !== id); });
export const addClosure = (date: string, reason: string) => app.update((s) => { s.closures.push({ date, reason }); }, { type: 'closure.changed' });
export const removeClosure = (date: string) => app.update((s) => { s.closures = s.closures.filter((c) => c.date !== date); }, { type: 'closure.changed' });

// ---------- customer accounts ----------
export async function signUp(input: { name: string; email: string; phone: string; password: string }): Promise<Client | 'exists'> {
  const email = input.email.toLowerCase();
  if (app.get().clients.some((c) => c.email === email)) return 'exists';
  const { salt, hash } = await hashPassword(input.password);
  const client: Client = { id: randomId('c'), name: input.name, email, phone: normPhone(input.phone), salt, hash, created: new Date().toISOString() };
  app.update((s) => { s.clients.push(client); });
  return client;
}

export type Session = { kind: 'client'; client: Client } | { kind: 'staff'; staff: StaffAccount } | null;

/** Same answer and similar timing whether the e-mail exists or not (no account enumeration). */
export async function logIn(emailRaw: string, password: string): Promise<Session> {
  const email = emailRaw.toLowerCase();
  const staff = STAFF.find((s) => s.email === email);
  const client = app.get().clients.find((c) => c.email === email);
  const record = staff ?? client;
  const ok = await verifyPassword(password, record?.salt ?? '00000000000000000000000000000000', record?.hash ?? '0'.repeat(64));
  if (!ok || !record) return null;
  return staff ? { kind: 'staff', staff } : { kind: 'client', client: client as Client };
}
