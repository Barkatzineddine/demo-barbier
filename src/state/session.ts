// Who is signed in, per tab (sessionStorage), plus a login throttle: 5 failures -> 30 s pause.
import { create } from 'zustand';
import { STAFF } from '../domain/catalog';
import { app, logIn, type Session } from './app';

const KEY = 'corbin:session';
const FAILS = 'corbin:login-fails';

function restore(): Session {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { kind: 'staff' | 'client'; id: string } | null;
    if (raw?.kind === 'staff') { const staff = STAFF.find((s) => s.id === raw.id); return staff ? { kind: 'staff', staff } : null; }
    if (raw?.kind === 'client') { const client = app.get().clients.find((c) => c.id === raw.id); return client ? { kind: 'client', client } : null; }
  } catch { /* ignore */ }
  return null;
}

export const useSession = create<{ session: Session }>(() => ({ session: restore() }));

export function setSession(session: Session): void {
  useSession.setState({ session });
  try {
    if (!session) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ kind: session.kind, id: session.kind === 'staff' ? session.staff.id : session.client.id }));
  } catch { /* storage blocked */ }
}

export type LoginOutcome = { ok: true } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'locked'; seconds: number };

export async function attemptLogin(email: string, password: string, now = Date.now()): Promise<LoginOutcome> {
  let fails: number[] = [];
  try { fails = (JSON.parse(sessionStorage.getItem(FAILS) ?? '[]') as number[]).filter((t) => now - t < 30_000); } catch { /* ignore */ }
  if (fails.length >= 5) return { ok: false, reason: 'locked', seconds: Math.ceil((30_000 - (now - (fails[0] ?? now))) / 1000) };
  const session = await logIn(email, password);
  if (!session) {
    try { sessionStorage.setItem(FAILS, JSON.stringify([...fails, now])); } catch { /* ignore */ }
    return { ok: false, reason: 'invalid' };
  }
  setSession(session);
  return { ok: true };
}

// ---------- bookings made from this device (guests) ----------
const MINE = 'corbin:mine';
export function deviceBookingIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 20).slice(-50) : [];
  } catch { return []; }
}
export function rememberBooking(id: string): void {
  try { localStorage.setItem(MINE, JSON.stringify([...new Set([...deviceBookingIds(), id])])); } catch { /* ignore */ }
}
