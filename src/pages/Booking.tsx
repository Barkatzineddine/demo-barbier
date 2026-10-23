import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { BARBERS, BOOKING_WINDOW_DAYS, SERVICES, barber, service, type BarberId, type ServiceId } from '../domain/catalog';
import { addDays, isoDate } from '../domain/dates';
import { bookingToIcs } from '../domain/ics';
import type { Booking as BookingT } from '../domain/schema';
import { dayInfo, freeSlots, type Slot } from '../domain/slots';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { book, useApp } from '../state/app';
import { deviceBookingIds, rememberBooking, useSession } from '../state/session';
import { useFormGuard } from '../shared/formGuard';
import { Link, navigate, usePage } from '../shared/router';
import { clean, download, isEmail, isName, isPhoneFR } from '../shared/security';
import { useFeedback } from '../shared/ui/Feedback';
import { Checkbox, Field, Honeypot, TextArea } from '../shared/ui/Field';

type Step = 0 | 1 | 2 | 3;

export default function Booking({ preset }: { preset: string | null }) {
  const { t } = useFormat();
  const presetService = SERVICES.find((s) => s.id === preset)?.id ?? null;
  const [step, setStep] = useState<Step>(presetService ? 1 : 0);
  const [serviceId, setServiceId] = useState<ServiceId | null>(presetService);
  const [barberId, setBarberId] = useState<BarberId | null | undefined>(undefined);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const go = (s: Step) => { setStep(s); requestAnimationFrame(() => document.querySelector<HTMLElement>('.step-title')?.focus()); };

  usePage(t('title.book'));
  return (
    <div className="wrap booking view">
      <Link className="back-link" to="/">{t('common.backHome')}</Link>
      <h1 ref={titleRef} tabIndex={-1}>{t('book.title')}</h1>
      <ol className="stepper">
        {([1, 2, 3, 4] as const).map((n, i) => (
          <li key={n} className={i < step ? 'done' : i === step ? 'current' : undefined} aria-current={i === step ? 'step' : undefined}>
            <span className="n" aria-hidden="true">{i < step ? '✓' : n}</span><span className="l">{t(`book.step.${n}` as Key)}</span>
          </li>
        ))}
      </ol>
      <div className="booking-grid">
        <div className="booking-main">
          {step === 0 ? <ChooseService selected={serviceId} onPick={(id) => { setServiceId(id); setSlot(null); go(1); }} /> : null}
          {step === 1 ? <ChooseBarber selected={barberId} onPick={(id) => { setBarberId(id); setSlot(null); go(2); }} onBack={() => go(0)} /> : null}
          {step === 2 && serviceId ? (
            <ChooseSlot serviceId={serviceId} barberId={barberId ?? null} date={date} setDate={setDate} onPick={(s) => { setSlot(s); go(3); }} onBack={() => go(1)} />
          ) : null}
          {step === 3 && serviceId && slot && date ? (
            <Details serviceId={serviceId} slot={slot} date={date} onBack={() => go(2)} onDone={(b) => navigate(`/rdv/${b.id}`)} onTaken={() => { setSlot(null); go(2); }} />
          ) : null}
        </div>
        <Summary serviceId={serviceId} barberId={slot?.barber ?? barberId} date={slot ? date : null} start={slot?.start ?? null} step={step} go={go} />
      </div>
    </div>
  );
}

function Choice({ title, meta, aside, pressed, onPick }: { title: ReactNode; meta?: ReactNode; aside?: ReactNode; pressed: boolean; onPick: () => void }) {
  return (
    <button type="button" className="choice" aria-pressed={pressed} onClick={onPick}>
      <span className="c-title">{title}</span>
      {meta ? <span className="c-meta">{meta}</span> : null}
      {aside ? <span className="c-aside">{aside}</span> : null}
    </button>
  );
}

function ChooseService({ selected, onPick }: { selected: ServiceId | null; onPick: (id: ServiceId) => void }) {
  const { t, duration, money } = useFormat();
  return (
    <section aria-labelledby="st">
      <h2 id="st" className="step-title" tabIndex={-1}>{t('book.t1')}</h2>
      <div className="choices">
        {SERVICES.map((s) => <Choice key={s.id} title={t(`svc.${s.id}.name` as Key)} meta={duration(s.minutes)} aside={money(s.price, 0)} pressed={selected === s.id} onPick={() => onPick(s.id)} />)}
      </div>
    </section>
  );
}

function ChooseBarber({ selected, onPick, onBack }: { selected: BarberId | null | undefined; onPick: (id: BarberId | null) => void; onBack: () => void }) {
  const { t, locale } = useFormat();
  const dayShort = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + d));
  return (
    <section aria-labelledby="st">
      <h2 id="st" className="step-title" tabIndex={-1}>{t('book.t2')}</h2>
      <div className="choices">
        <Choice title={t('book.any')} meta={t('book.anyHint')} pressed={selected === null} onPick={() => onPick(null)} />
        {BARBERS.map((b) => <Choice key={b.id} title={b.name} meta={`${t(`team.${b.id}.role` as Key)} · ${b.days.map(dayShort).join(', ')}`} pressed={selected === b.id} onPick={() => onPick(b.id)} />)}
      </div>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onBack}>{t('common.back')}</button></div>
    </section>
  );
}

function ChooseSlot({ serviceId, barberId, date, setDate, onPick, onBack }: {
  serviceId: ServiceId; barberId: BarberId | null; date: string | null; setDate: (d: string) => void; onPick: (s: Slot) => void; onBack: () => void;
}) {
  const { t, date: fmtDate, shortDay, hhmm } = useFormat();
  const state = useApp((s) => s);
  const today = isoDate(new Date());
  const days = useMemo(() => Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDays(today, i)).map((iso) => {
    const info = dayInfo(state, iso);
    return { iso, info, slots: info.open ? freeSlots(state, iso, serviceId, barberId) : [] };
  }), [state, today, serviceId, barberId]);
  const selected = days.find((d) => d.iso === date) ?? days.find((d) => d.slots.length) ?? days[0];
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected && selected.iso !== date) setDate(selected.iso); }, [selected, date, setDate]);
  useEffect(() => { stripRef.current?.querySelector('.day.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [selected?.iso]);
  if (!selected) return null;
  const groups = ([['book.morning', 0, 720], ['book.afternoon', 720, 1020], ['book.evening', 1020, 1440]] as const)
    .map(([label, a, b]) => [label, selected.slots.filter((s) => s.start >= a && s.start < b)] as const)
    .filter(([, list]) => list.length);
  const nextFree = days.find((d) => d.iso > selected.iso && d.slots.length);

  return (
    <section aria-labelledby="st">
      <h2 id="st" className="step-title" tabIndex={-1}>{t('book.t3')}</h2>
      <div className="days" role="group" aria-label={t('book.days')} ref={stripRef}>
        {days.map((d) => {
          const sub = !d.info.open ? (d.info.reason === 'holiday' ? t('book.holiday') : t('book.closedDay')) : d.slots.length ? t('book.free', { n: d.slots.length }) : t('book.full');
          return (
            <button key={d.iso} type="button" className={`day ${d.iso === selected.iso ? 'on' : ''}`} aria-pressed={d.iso === selected.iso} disabled={!d.slots.length} aria-label={`${fmtDate(d.iso)} : ${sub}`} onClick={() => setDate(d.iso)}>
              <span className="d1">{shortDay(d.iso)}</span><span className="d2">{sub}</span>
            </button>
          );
        })}
      </div>
      <h3 className="day-title">{fmtDate(selected.iso)}</h3>
      {groups.length ? groups.map(([label, list]) => (
        <div className="slot-group" key={label}>
          <p className="slot-label">{t(label)}</p>
          <div className="slots">
            {list.map((s) => (
              <button key={s.start} type="button" className="slot" onClick={() => onPick(s)} aria-label={`${hhmm(s.start)}${barberId ? '' : ` ${t('book.withBarber', { name: barber(s.barber).name })}`}`}>{hhmm(s.start)}</button>
            ))}
          </div>
        </div>
      )) : (
        <p className="empty">{t('book.noSlot')} {nextFree ? <button type="button" className="linklike" onClick={() => setDate(nextFree.iso)}>{t('book.nextDay', { day: fmtDate(nextFree.iso) })}</button> : null}</p>
      )}
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onBack}>{t('common.back')}</button></div>
    </section>
  );
}

function Details({ serviceId, slot, date, onBack, onDone, onTaken }: {
  serviceId: ServiceId; slot: Slot; date: string; onBack: () => void; onDone: (b: BookingT) => void; onTaken: () => void;
}) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const session = useSession((s) => s.session);
  const client = session?.kind === 'client' ? session.client : null;
  const guard = useFormGuard({ key: 'corbin:booking', max: 3, windowMs: 30 * 60_000, minMs: 2000 });
  const [v, setV] = useState({ name: client?.name ?? '', phone: client?.phone ?? '', email: client?.email ?? '', note: '', consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v, val: string | boolean) => setV((s) => ({ ...s, [k]: val }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = clean(v.name, 60), phone = clean(v.phone, 20), email = clean(v.email, 254).toLowerCase(), note = clean(v.note, 300, true);
    const next: Record<string, string> = {};
    if (!isName(name)) next.name = t('err.name');
    if (!isPhoneFR(phone)) next.phone = t('err.phone');
    if (email && !isEmail(email)) next.email = t('err.email');
    if (!v.consent) next.consent = t('err.consent');
    flushSync(() => setErrors(next)); // render the errors first, then focus the first one
    if (Object.keys(next).length) { document.querySelector<HTMLElement>('.booking-main [aria-invalid="true"]')?.focus(); return; }
    const verdict = guard.check(note);
    if (!verdict.ok) {
      if (verdict.silent) return;
      toast(verdict.reason === 'too-fast' ? t('err.tooFast') : verdict.reason === 'too-many-links' ? t('err.links') : t('err.rate', { n: verdict.waitMinutes ?? 1 }), 'err');
      return;
    }
    const result = book({ service: serviceId, barber: slot.barber, date, start: slot.start, name, phone, email, note, source: 'online', clientId: client?.id });
    if (!result.ok) {
      toast(t(`err.${result.error}` as Key), 'err');
      if (result.error !== 'phone-limit') onTaken();
      return;
    }
    verdict.commit();
    rememberBooking(result.booking.id);
    onDone(result.booking);
  };

  return (
    <form className="form card" noValidate onSubmit={submit}>
      <h2 id="st" className="step-title" tabIndex={-1}>{t('book.t4')}</h2>
      {client ? <p className="hint">{t('book.signedAs', { email: client.email })}</p> : null}
      <Field label={t('contact.name')} autoComplete="name" maxLength={60} value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
      <Field label={t('book.phone')} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={v.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={t('book.phoneHint')} />
      <Field label={t('book.emailOpt')} type="email" autoComplete="email" maxLength={254} value={v.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
      <TextArea label={t('book.note')} rows={3} maxLength={300} value={v.note} onChange={(e) => set('note', e.target.value)} />
      <Checkbox label={t('book.consent')} checked={v.consent} onChange={(e) => set('consent', e.target.checked)} error={errors.consent} />
      <Honeypot inputRef={guard.honeypotRef} label={t('honeypot')} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>{t('book.changeSlot')}</button>
        <button type="submit" className="btn btn-primary">{t('book.confirm')}</button>
      </div>
    </form>
  );
}

function Summary({ serviceId, barberId, date, start, step, go }: {
  serviceId: ServiceId | null; barberId: BarberId | null | undefined; date: string | null; start: number | null; step: Step; go: (s: Step) => void;
}) {
  const { t, duration, money, when } = useFormat();
  const s = serviceId ? service(serviceId) : null;
  const who = barberId ? barber(barberId).name : barberId === null ? t('book.any') : null;
  const row = (label: string, value: string | null, at: Step) => (
    <div className="sum-row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}{value && at < step ? <button type="button" className="linklike" onClick={() => go(at)}>{t('book.edit')}<span className="sr"> {label}</span></button> : null}</dd>
    </div>
  );
  return (
    <aside className="summary card" aria-label={t('book.summary')}>
      <h2>{t('book.summary')}</h2>
      <dl>
        {row(t('book.step.1'), s ? `${t(`svc.${s.id}.name` as Key)} · ${duration(s.minutes)}` : null, 0)}
        {row(t('book.step.2'), who, 1)}
        {row(t('book.step.3'), date && start !== null ? when(date, start) : null, 2)}
      </dl>
      <p className="sum-total"><span>{t('book.payAtShop')}</span><strong>{s ? money(s.price, 0) : '—'}</strong></p>
      <p className="hint">{t('book.policy')}</p>
    </aside>
  );
}

/** Shown at #/rdv/<id>, only to the device or the account that made the booking. */
export function ConfirmationPage({ id }: { id: string }) {
  const { t } = useFormat();
  usePage(t('title.done'));
  const booking = useApp((s) => s.bookings.find((b) => b.id === id));
  const session = useSession((s) => s.session);
  const mine = booking && (deviceBookingIds().includes(booking.id) || (session?.kind === 'client' && booking.clientId === session.client.id));
  if (!booking || !mine) {
    return (
      <div className="wrap narrow view">
        <h1 tabIndex={-1}>{t('book.notFound')}</h1>
        <p><Link className="btn btn-primary" to="/reserver">{t('nav.book')}</Link></p>
      </div>
    );
  }
  return <Confirmation booking={booking} />;
}

function Confirmation({ booking }: { booking: BookingT }) {
  const { t, when, duration, money } = useFormat();
  const s = service(booking.service);
  const name = t(`svc.${s.id}.name` as Key);
  return (
    <div className="wrap narrow view">
      <h1 tabIndex={-1}>{t('book.done')}</h1>
      <div className="card confirm">
        <div className="confirm-mark" aria-hidden="true">✓</div>
        <p className="lead">{t('book.confirmLead', { service: name, barber: barber(booking.barber).name, when: when(booking.date, booking.start) })}</p>
        <p>{t('book.code')}<strong className="code">{booking.code}</strong></p>
        <p className="hint">{t('book.codeHint')} {duration(s.minutes)} · {money(s.price, 0)}</p>
        <div className="form-actions center">
          <button type="button" className="btn btn-primary" onClick={() => download(`rdv-maison-corbin-${booking.date}.ics`, bookingToIcs(booking, name), 'text/calendar')}>{t('book.ics')}</button>
          <Link className="btn btn-ghost" to="/compte">{t('book.mine')}</Link>
          <Link className="btn btn-ghost" to="/equipe">{t('book.staffView')}</Link>
        </div>
        <p className="hint">{t('book.liveHint')}</p>
      </div>
    </div>
  );
}
