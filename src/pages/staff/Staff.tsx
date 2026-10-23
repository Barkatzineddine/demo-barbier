import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { DEMO_LOGINS, barber, service, type StaffAccount } from '../../domain/catalog';
import { addDays, atTime, isoDate } from '../../domain/dates';
import { fillRate } from '../../domain/slots';
import { useFormat } from '../../format';
import type { Key } from '../../i18n';
import { useApp } from '../../state/app';
import { attemptLogin, setSession, useSession } from '../../state/session';
import { Link, navigate, useLocation, usePage } from '../../shared/router';
import { CommandPalette, type Command } from '../../shared/ui/CommandPalette';
import { Field } from '../../shared/ui/Field';
import { Agenda } from './Agenda';

const BookingsList = lazy(() => import('./BookingsList'));
const Stats = lazy(() => import('./Stats'));
const Messages = lazy(() => import('./Messages'));
const Closures = lazy(() => import('./Closures'));

type Tab = 'agenda' | 'list' | 'stats' | 'messages' | 'closures';

export default function Staff() {
  const { t } = useFormat();
  usePage(t('title.staff'));
  const session = useSession((s) => s.session);
  if (session?.kind !== 'staff') return <StaffLogin />;
  return <StaffArea staff={session.staff} />;
}

function StaffLogin() {
  const { t } = useFormat();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await attemptLogin(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.reason === 'locked' ? t('account.locked', { n: result.seconds }) : t('account.invalid'));
    else if (useSession.getState().session?.kind !== 'staff') { setSession(null); setError(t('account.invalid')); }
  };
  return (
    <div className="wrap narrow view">
      <Link className="back-link" to="/">{t('common.backHome')}</Link>
      <h1 tabIndex={-1}>{t('staff.title')}</h1>
      <p>{t('staff.loginLead')}</p>
      <form className="card form login" noValidate onSubmit={(e) => void submit(e)}>
        <Field label={t('account.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('account.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{t('account.login')}</button>
      </form>
      <section className="card demo-logins">
        <h2 className="h-card">{t('staff.demo')}</h2>
        <ul>
          {DEMO_LOGINS.map((d) => (
            <li key={d.email}>
              <div><strong>{t(`staff.role.${d.role}` as Key)}</strong> · {t(`staff.roleNote.${d.role}` as Key)}<br /><code>{d.email}</code> / <code>{d.password}</code></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}>{t('staff.use')}</button>
            </li>
          ))}
        </ul>
        <p className="hint">{t('staff.prodNote')}</p>
      </section>
    </div>
  );
}

function StaffArea({ staff }: { staff: StaffAccount }) {
  const { t, money, shortDay, hhmm } = useFormat();
  const { query } = useLocation();
  const isManager = staff.role === 'manager';
  const tabs: Tab[] = isManager ? ['agenda', 'list', 'stats', 'messages', 'closures'] : ['agenda', 'list', 'stats'];
  const tab = (tabs.find((x) => x === query.get('tab')) ?? 'agenda') as Tab;
  const focusDate = /^\d{4}-\d{2}-\d{2}$/.test(query.get('d') ?? '') ? (query.get('d') as string) : isoDate(new Date());
  const focusBooking = query.get('b');
  const state = useApp((s) => s);
  const unread = state.messages.filter((m) => !m.read).length;
  const setTab = (next: Tab) => navigate(`/equipe?tab=${next}`);

  const commands = useMemo<Command[]>(() => {
    const visible = state.bookings.filter((b) => isManager || b.barber === staff.barber);
    return [
      { id: 'today', group: t('palette.actions'), label: t('palette.goToday'), run: () => navigate(`/equipe?tab=agenda&d=${isoDate(new Date())}`) },
      ...tabs.map((x) => ({ id: `tab-${x}`, group: t('palette.actions'), label: t(`staff.tab.${x}` as Key), run: () => setTab(x) })),
      ...visible.slice(-400).map((b) => ({
        id: b.id, group: t('palette.bookings'), label: `${b.name} · ${shortDay(b.date)} ${hhmm(b.start)}`,
        hint: `${b.code} · ${barber(b.barber).name}`, keywords: `${b.phone} ${b.code}`,
        run: () => navigate(`/equipe?tab=agenda&d=${b.date}&b=${b.id}`),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bookings, isManager, staff.barber, t]);

  return (
    <div className="wrap staff view">
      <div className="staff-head">
        <div>
          <Link className="back-link" to="/">{t('common.backHome')}</Link>
          <h1 tabIndex={-1}>{t('staff.title')}</h1>
          <p className="muted">{t('staff.hello', { name: staff.name, role: t(`staff.role.${staff.role}` as Key) })}</p>
        </div>
        <div className="staff-tools">
          <CommandPalette commands={commands} labels={{ title: t('palette.title'), placeholder: t('palette.placeholder'), empty: t('palette.empty'), open: t('palette.open') }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSession(null)}>{t('account.logout')}</button>
        </div>
      </div>
      <Kpis staff={staff} unread={unread} money={money} />
      <div className="tabs" role="tablist" aria-label={t('staff.title')}>
        {tabs.map((x) => (
          <button key={x} type="button" role="tab" id={`tab-${x}`} aria-selected={tab === x} aria-controls="panel" tabIndex={tab === x ? 0 : -1}
            onClick={() => setTab(x)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = tabs.indexOf(tab);
              const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length] as Tab;
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
            }}>
            {t(`staff.tab.${x}` as Key)}{x === 'messages' && unread ? <span className="badge">{unread}</span> : null}
          </button>
        ))}
      </div>
      <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="panel">
        <Suspense fallback={<div className="route-loading" />}>
          {tab === 'agenda' ? <Agenda staff={staff} focusDate={focusDate} focusBooking={focusBooking} /> : null}
          {tab === 'list' ? <BookingsList staff={staff} /> : null}
          {tab === 'stats' ? <Stats staff={staff} /> : null}
          {tab === 'messages' && isManager ? <Messages /> : null}
          {tab === 'closures' && isManager ? <Closures /> : null}
        </Suspense>
      </div>
    </div>
  );
}

function Kpis({ staff, unread, money }: { staff: StaffAccount; unread: number; money: (v: number, d?: number) => string }) {
  const { t } = useFormat();
  const state = useApp((s) => s);
  const mine = (b: { barber: string }) => staff.role === 'manager' || b.barber === staff.barber;
  const today = isoDate(new Date());
  const live = state.bookings.filter((b) => b.status !== 'cancelled' && mine(b));
  const todayList = live.filter((b) => b.date === today);
  const left = todayList.filter((b) => b.status === 'confirmed' && atTime(b.date, b.start) > new Date()).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const weekBookings = live.filter((b) => week.includes(b.date) && b.status === 'confirmed');
  const revenue = weekBookings.reduce((s, b) => s + service(b.service).price, 0);
  const tiles: [string, string, string][] = [
    [t('kpi.today'), String(todayList.length), t('kpi.todaySub', { n: left })],
    [t('kpi.revenue'), money(revenue, 0), t('kpi.revenueSub', { n: weekBookings.length })],
    [t('kpi.fill'), `${Math.round(fillRate(state, week) * 100)} %`, t('kpi.fillSub')],
  ];
  if (staff.role === 'manager') tiles.push([t('kpi.messages'), String(unread), unread ? t('kpi.unread') : t('kpi.allRead')]);
  return (
    <div className={`kpis kpis-${tiles.length}`}>
      {tiles.map(([label, value, sub]) => (
        <div key={label} className="kpi"><p className="kpi-label">{label}</p><p className="kpi-value">{value}</p><p className="kpi-sub">{sub}</p></div>
      ))}
    </div>
  );
}
