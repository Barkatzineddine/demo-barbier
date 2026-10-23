import { useState, type FormEvent } from 'react';
import { barber, service } from '../domain/catalog';
import { atTime } from '../domain/dates';
import type { Booking } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { canCancel, cancelByCustomer, signUp, useApp } from '../state/app';
import { attemptLogin, deviceBookingIds, rememberBooking, setSession, useSession } from '../state/session';
import { Link, usePage } from '../shared/router';
import { clean, isEmail, isName, isPhoneFR, normPhone } from '../shared/security';
import { useFeedback } from '../shared/ui/Feedback';
import { Field } from '../shared/ui/Field';

export default function Account() {
  const { t } = useFormat();
  usePage(t('title.account'));
  const session = useSession((s) => s.session);
  return (
    <div className="wrap narrow view">
      <Link className="back-link" to="/">{t('common.backHome')}</Link>
      <h1 tabIndex={-1}>{t('account.title')}</h1>
      {session?.kind === 'client' ? <ClientHome /> : session?.kind === 'staff' ? <p><Link className="btn btn-primary" to="/equipe">{t('nav.staff')}</Link></p> : <AuthForms />}
      <DeviceBookings />
      <Lookup />
    </div>
  );
}

function AuthForms() {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [v, setV] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const email = clean(v.email, 254).toLowerCase();
    const next: Record<string, string> = {};
    if (!isEmail(email)) next.email = t('err.email');
    if (mode === 'signup') {
      if (!isName(clean(v.name, 60))) next.name = t('err.name');
      if (!isPhoneFR(v.phone)) next.phone = t('err.phone');
      if (v.password.length < 10) next.password = t('err.password');
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await attemptLogin(email, v.password);
        if (!result.ok) setErrors({ password: result.reason === 'locked' ? t('account.locked', { n: result.seconds }) : t('account.invalid') });
      } else {
        const client = await signUp({ name: clean(v.name, 60), email, phone: v.phone, password: v.password });
        if (client === 'exists') setErrors({ email: t('account.exists') });
        else { setSession({ kind: 'client', client }); toast(t('account.signupDone')); }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card auth">
      <div className="seg" role="group">
        <button type="button" className="seg-btn" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setErrors({}); }}>{t('account.login')}</button>
        <button type="button" className="seg-btn" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setErrors({}); }}>{t('account.signup')}</button>
      </div>
      <p className="hint">{t('account.why')}</p>
      <form className="form" noValidate onSubmit={(e) => void submit(e)}>
        {mode === 'signup' ? <Field label={t('contact.name')} autoComplete="name" maxLength={60} value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} /> : null}
        <Field label={t('account.email')} type="email" autoComplete="email" maxLength={254} value={v.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        {mode === 'signup' ? <Field label={t('book.phone')} type="tel" autoComplete="tel" maxLength={20} value={v.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} /> : null}
        <Field label={t('account.password')} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} value={v.password} onChange={(e) => set('password', e.target.value)} error={errors.password} hint={mode === 'signup' ? t('account.passwordHint') : undefined} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{mode === 'login' ? t('account.login') : t('account.signup')}</button>
      </form>
    </section>
  );
}

function ClientHome() {
  const { t } = useFormat();
  const session = useSession((s) => s.session);
  const client = session?.kind === 'client' ? session.client : null;
  const bookings = useApp((s) => s.bookings);
  if (!client) return null;
  const mine = bookings.filter((b) => b.clientId === client.id || (b.phone === normPhone(client.phone) && b.source === 'online'))
    .sort((a, b) => atTime(b.date, b.start).getTime() - atTime(a.date, a.start).getTime());
  return (
    <section className="card">
      <div className="row-between">
        <h2 className="h-card">{t('account.welcome', { name: client.name.split(' ')[0] ?? client.name })}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSession(null)}>{t('account.logout')}</button>
      </div>
      {mine.length ? <BookingList bookings={mine} /> : <p className="muted">{t('account.noBookings')} <Link to="/reserver">{t('nav.book')} →</Link></p>}
    </section>
  );
}

function DeviceBookings() {
  const { t } = useFormat();
  const bookings = useApp((s) => s.bookings);
  const session = useSession((s) => s.session);
  const ids = deviceBookingIds();
  const clientId = session?.kind === 'client' ? session.client.id : null;
  const list = ids.map((id) => bookings.find((b) => b.id === id)).filter((b): b is Booking => Boolean(b) && b?.clientId !== clientId)
    .sort((a, b) => atTime(b.date, b.start).getTime() - atTime(a.date, a.start).getTime());
  if (!list.length) return null;
  return (
    <section className="card">
      <h2 className="h-card">{t('account.deviceTitle')}</h2>
      <BookingList bookings={list} />
    </section>
  );
}

function BookingList({ bookings }: { bookings: Booking[] }) {
  const { t, shortDay, hhmm, money } = useFormat();
  const { confirm, toast } = useFeedback();
  const now = new Date();
  const cancel = async (b: Booking) => {
    const name = t(`svc.${b.service}.name` as Key);
    const ok = await confirm({ title: t('account.cancelTitle'), body: t('account.cancelBody', { service: name, when: `${shortDay(b.date)} ${hhmm(b.start)}` }), ok: t('account.cancel'), cancel: t('account.keep'), danger: true });
    if (ok && cancelByCustomer(b.id)) toast(t('account.cancelled'));
  };
  return (
    <ul className="rdv-list">
      {bookings.map((b) => {
        const past = atTime(b.date, b.start) < now;
        const status = b.status === 'confirmed' && past ? 'done' : b.status;
        return (
          <li key={b.id} className={`rdv st-${status}`}>
            <div className="rdv-when"><span className="rdv-day">{shortDay(b.date)}</span><span className="rdv-time">{hhmm(b.start)}</span></div>
            <div>
              <p className="rdv-title">{t(`svc.${b.service}.name` as Key)} · {barber(b.barber).name}</p>
              <p className="hint">{b.code} · {money(service(b.service).price, 0)} · <span className="chip">{t(`status.${status}` as Key)}</span></p>
            </div>
            <div className="rdv-actions">
              {canCancel(b, now) ? <button type="button" className="btn btn-danger btn-sm" onClick={() => void cancel(b)}>{t('account.cancel')}</button>
                : b.status === 'confirmed' && !past ? <p className="hint">{t('account.tooLate')}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Lookup() {
  const { t } = useFormat();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bookings = useApp((s) => s.bookings);
  const [, force] = useState(0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const b = bookings.find((x) => x.code === clean(code, 12).toUpperCase() && x.phone === normPhone(clean(phone, 20)));
    // same message whether the code or the phone is wrong: nothing to learn from guessing
    if (!b) { setError(t('account.notFound')); return; }
    setError(null);
    rememberBooking(b.id);
    force((n) => n + 1);
  };
  return (
    <form className="card form lookup" noValidate onSubmit={submit}>
      <h2 className="h-card">{t('account.lookup')}</h2>
      <p className="hint">{t('account.lookupHint')}</p>
      <div className="row2">
        <Field label={t('account.code')} placeholder="MC-XXXXX" maxLength={12} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} error={error} />
        <Field label={t('book.phone')} type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary">{t('account.find')}</button>
    </form>
  );
}
