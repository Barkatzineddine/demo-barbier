import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_LOGINS } from '../../src/domain/catalog';
import { match } from '../../src/shared/router';
import { app, logIn, signUp } from '../../src/state/app';
import { attemptLogin, setSession, useSession } from '../../src/state/session';

const account = { name: 'Léa Martin', email: 'Lea.Martin@example.com', phone: '+33611223344', password: 'un mot de passe long' };

beforeEach(() => {
  app.update((s) => { s.clients = []; });
  sessionStorage.clear();
  setSession(null);
});

describe('customer accounts', () => {
  it('stores a salted hash, never the password', async () => {
    const client = await signUp(account);
    expect(client).not.toBe('exists');
    if (client === 'exists') return;
    expect(client.email).toBe('lea.martin@example.com');
    expect(client.phone).toBe('06 11 22 33 44');
    expect(localStorage.getItem('corbin:v2')).not.toContain(account.password);
  });

  it('refuses a second account with the same e-mail, whatever the case', async () => {
    await signUp(account);
    expect(await signUp({ ...account, email: 'LEA.MARTIN@EXAMPLE.COM' })).toBe('exists');
  });

  it('logs in with the right password only', async () => {
    await signUp(account);
    expect(await logIn('lea.martin@example.com', account.password)).toMatchObject({ kind: 'client' });
    expect(await logIn('lea.martin@example.com', 'wrong password')).toBeNull();
  });

  it('gives the same answer for an unknown e-mail (no account enumeration)', async () => {
    expect(await logIn('nobody@example.com', account.password)).toBeNull();
  });

  it('recognises the demo staff accounts and their role', async () => {
    const [manager, barber] = DEMO_LOGINS;
    expect(await logIn(manager?.email ?? '', manager?.password ?? '')).toMatchObject({ kind: 'staff', staff: { role: 'manager' } });
    expect(await logIn(barber?.email ?? '', barber?.password ?? '')).toMatchObject({ kind: 'staff', staff: { role: 'barber', barber: 'theo' } });
  });
});

describe('login throttling and session', () => {
  it('locks for 30 seconds after five failures', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(await attemptLogin('x@example.com', 'nope', t0 + i)).toEqual({ ok: false, reason: 'invalid' });
    expect(await attemptLogin('x@example.com', 'nope', t0 + 10_000)).toEqual({ ok: false, reason: 'locked', seconds: 20 });
    const [manager] = DEMO_LOGINS;
    // even the right password waits: the lock is not an oracle
    expect((await attemptLogin(manager?.email ?? '', manager?.password ?? '', t0 + 20_000)).ok).toBe(false);
    expect(await attemptLogin(manager?.email ?? '', manager?.password ?? '', t0 + 31_000)).toEqual({ ok: true });
  });

  it('keeps only the kind and id of the session in sessionStorage', async () => {
    const [manager] = DEMO_LOGINS;
    await attemptLogin(manager?.email ?? '', manager?.password ?? '');
    expect(useSession.getState().session?.kind).toBe('staff');
    expect(JSON.parse(sessionStorage.getItem('corbin:session') ?? '{}')).toEqual({ kind: 'staff', id: 'staff-karim' });
  });
});

describe('router', () => {
  it('matches static and parameter segments', () => {
    expect(match('/equipe', '/equipe')).toEqual({});
    expect(match('/rdv/:code', '/rdv/MC-K7P2Q')).toEqual({ code: 'MC-K7P2Q' });
    expect(match('/rdv/:code', '/rdv')).toBeNull();
    expect(match('/equipe', '/compte')).toBeNull();
  });
});
