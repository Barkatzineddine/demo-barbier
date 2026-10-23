// Staff agenda: one lane per barber per day; drag a booking to move it (dnd-kit), with a live
// indicator of the target time, a conflict check, and an undo. Everything is also doable from the
// booking dialog, for keyboard and screen-reader users.
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { BARBERS, SERVICES, STEP, barber, service, type BarberId, type ServiceId, type StaffAccount } from '../../domain/catalog';
import { addDays, atTime, hhmm, isoDate, minutesOf, startOfWeek } from '../../domain/dates';
import type { Booking, State } from '../../domain/schema';
import { dayInfo, freeSlots, worksOn } from '../../domain/slots';
import { useFormat } from '../../format';
import type { Key } from '../../i18n';
import { book, moveBooking, setStatus, useApp } from '../../state/app';
import { navigate } from '../../shared/router';
import { useNow } from '../../shared/useNow';
import { clean, isName, isPhoneFR } from '../../shared/security';
import { Dialog } from '../../shared/ui/Dialog';
import { useFeedback } from '../../shared/ui/Feedback';
import { Field, Select } from '../../shared/ui/Field';

const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const laneId = (date: string, b: BarberId) => `${date}|${b}`;
const parseLane = (id: string) => { const [date, b] = id.split('|'); return { date: date as string, barber: b as BarberId }; };
const snap = (min: number) => Math.round(min / STEP) * STEP;

function useNarrow(): boolean {
  const query = '(max-width: 899px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function Agenda({ staff, focusDate, focusBooking }: { staff: StaffAccount; focusDate: string; focusBooking: string | null }) {
  const { t, date: fmtDate, shortDay } = useFormat();
  const { toast } = useFeedback();
  const state = useApp((s) => s);
  const narrow = useNarrow();
  // a manager starts on the day (all barbers side by side), a barber on their own week
  const [view, setView] = useState<'day' | 'week'>(staff.role === 'manager' ? 'day' : 'week');
  const mode = narrow ? 'day' : view;
  const ppm = mode === 'week' ? 1.25 : narrow ? 1.3 : 1.5;
  const [filter, setFilter] = useState<BarberId | 'all'>(staff.role === 'barber' ? staff.barber : 'all');
  // a week shows one barber at a time: 21 lanes would be unreadable
  const shown: BarberId | 'all' = mode === 'week' && filter === 'all' ? (BARBERS[0] as (typeof BARBERS)[number]).id : filter;
  const [openId, setOpenId] = useState<string | null>(focusBooking);
  const [seenFocus, setSeenFocus] = useState(focusBooking);
  if (seenFocus !== focusBooking) { setSeenFocus(focusBooking); setOpenId(focusBooking); }
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<Booking | null>(null);
  const [indicator, setIndicator] = useState<{ lane: string; start: number; end: number; ok: boolean } | null>(null);

  const days = mode === 'day' ? [focusDate] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focusDate), i));
  const lanes = BARBERS.filter((b) => (staff.role === 'barber' ? b.id === staff.barber : shown === 'all' || b.id === shown));
  const shift = (n: number) => navigate(`/equipe?tab=agenda&d=${addDays(focusDate, n)}`);
  const step = mode === 'day' ? 1 : 7;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );
  const open = openId ? state.bookings.find((b) => b.id === openId) ?? null : null;

  // The drop time comes from the live pointer and the lane's on-screen position, both in viewport
  // coordinates, so it stays right when the calendar or the page scrolls during the drag.
  const pointer = useRef({ y: 0, offset: 0 });
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent | TouchEvent) => {
      pointer.current.y = 'touches' in e ? (e.touches[0]?.clientY ?? pointer.current.y) : e.clientY;
    };
    // capture on window: runs before dnd-kit's own listeners, so onDragMove sees this position
    window.addEventListener('pointermove', onMove, { capture: true });
    window.addEventListener('touchmove', onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('touchmove', onMove, { capture: true });
    };
  }, [dragging]);

  const target = (e: DragMoveEvent | DragEndEvent) => {
    const over = e.over;
    const laneTop = over ? document.querySelector(`[data-lane="${String(over.id)}"]`)?.getBoundingClientRect().top : undefined;
    if (!over || laneTop === undefined || !dragging) return null;
    const lane = parseLane(String(over.id));
    const minutes = service(dragging.service).minutes;
    const raw = snap(DAY_START + (pointer.current.y - pointer.current.offset - laneTop) / ppm);
    const start = Math.min(Math.max(DAY_START, raw), DAY_END - minutes);
    return { ...lane, start, end: start + minutes, lane: String(over.id) };
  };
  const onDragStart = (e: DragStartEvent) => {
    const ev = e.activatorEvent as PointerEvent | TouchEvent;
    const y = 'touches' in ev ? (ev.touches[0]?.clientY ?? 0) : ev.clientY;
    const top = document.querySelector(`[data-booking="${String(e.active.id)}"]`)?.getBoundingClientRect().top ?? y;
    pointer.current = { y, offset: y - top };
    setDragging(state.bookings.find((b) => b.id === e.active.id) ?? null);
  };
  const onDragMove = (e: DragMoveEvent) => {
    const to = target(e);
    if (!to || !dragging) { setIndicator(null); return; }
    const ok = moveCheck(dragging, to);
    setIndicator({ lane: to.lane, start: to.start, end: to.end, ok });
  };
  const moveCheck = (b: Booking, to: { date: string; start: number; barber: BarberId }) => {
    if (atTime(to.date, to.start) < new Date()) return false; // never into the past
    const copy = { ...state, bookings: state.bookings.filter((x) => x.id !== b.id) };
    return freeSlots(copy, to.date, b.service, to.barber, new Date(0)).some((s) => s.start === to.start);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const to = target(e);
    const b = dragging;
    setDragging(null);
    setIndicator(null);
    if (!to || !b || (to.date === b.date && to.start === b.start && to.barber === b.barber)) return;
    const before = { date: b.date, start: b.start, barber: b.barber };
    if (atTime(to.date, to.start) < new Date()) { toast(t('err.outside-hours'), 'err'); return; }
    const error = moveBooking(b.id, { date: to.date, start: to.start, barber: to.barber });
    if (error) { toast(t(`err.${error}` as Key), 'err'); return; }
    toast(t('agenda.moved', { when: `${shortDay(to.date)} ${hhmm(to.start)}`, barber: barber(to.barber).name }), 'ok', {
      label: t('agenda.undo'), run: () => { moveBooking(b.id, before); },
    });
  };

  return (
    <section className="agenda" aria-label={t('staff.tab.agenda')}>
      <div className="agenda-toolbar">
        <div className="day-nav">
          <button type="button" className="btn btn-ghost btn-sm" aria-label={mode === 'day' ? t('agenda.prevDay') : t('agenda.prev')} onClick={() => shift(-step)}>←</button>
          <label className="sr" htmlFor="agenda-date">{t('agenda.day')}</label>
          <input id="agenda-date" type="date" value={focusDate} onChange={(e) => { if (e.target.value) navigate(`/equipe?tab=agenda&d=${e.target.value}`); }} />
          <button type="button" className="btn btn-ghost btn-sm" aria-label={mode === 'day' ? t('agenda.nextDay') : t('agenda.next')} onClick={() => shift(step)}>→</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/equipe?tab=agenda&d=${isoDate(new Date())}`)}>{t('agenda.today')}</button>
        </div>
        {narrow ? null : (
          <div className="seg" role="group" aria-label={t('agenda.view')}>
            <button type="button" className="seg-btn" aria-pressed={view === 'day'} onClick={() => setView('day')}>{t('agenda.viewDay')}</button>
            <button type="button" className="seg-btn" aria-pressed={view === 'week'} onClick={() => setView('week')}>{t('agenda.viewWeek')}</button>
          </div>
        )}
        {staff.role === 'manager' ? (
          <div className="seg" role="group" aria-label={t('agenda.filter')}>
            {mode === 'day' ? <button type="button" className="seg-btn" aria-pressed={shown === 'all'} onClick={() => setFilter('all')}>{t('common.all')}</button> : null}
            {BARBERS.map((b) => <button key={b.id} type="button" className={`seg-btn lane-${b.id}`} aria-pressed={shown === b.id} onClick={() => setFilter(b.id)}>{b.name}</button>)}
          </div>
        ) : null}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>{t('agenda.add')}</button>
      </div>
      <h2 className="agenda-title">{mode === 'day' ? fmtDate(focusDate) : t('agenda.week', { date: fmtDate(days[0] as string, { day: 'numeric', month: 'long', year: 'numeric' }) })}</h2>
      <p className="hint">{t('agenda.hint')}</p>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setIndicator(null); }}>
        <div className={`cal cal-${mode}`} style={{ '--ppm': ppm, '--lanes': lanes.length } as CSSProperties}>
          <div className="cal-times" aria-hidden="true">
            {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => <span key={i} style={{ top: i * 60 * ppm }}>{hhmm(DAY_START + i * 60)}</span>)}
          </div>
          <div className="cal-days" style={{ gridTemplateColumns: days.map((d) => (dayInfo(state, d).open ? 'minmax(calc(var(--lanes) * var(--lane-min)), 1fr)' : 'minmax(64px, .35fr)')).join(' ') }}>
            {days.map((d) => {
              const info = dayInfo(state, d);
              return (
                <div key={d} className={`cal-day ${d === isoDate(new Date()) ? 'is-today' : ''} ${info.open ? '' : 'is-closed'}`}>
                  <div className="cal-day-head">
                    <button type="button" className="linklike" onClick={() => navigate(`/equipe?tab=agenda&d=${d}`)}>{shortDay(d)}</button>
                    {!info.open ? <span className="cal-closed">{info.reason === 'holiday' ? t(`hol.${info.holiday}` as Key) : info.reason === 'closure' ? info.label : t('agenda.closed')}</span> : null}
                  </div>
                  <div className="cal-lanes">
                    {lanes.map((b) => (
                      <Lane key={b.id} date={d} barberId={b.id} ppm={ppm} openDay={info.open} showName={lanes.length > 1}
                        bookings={state.bookings.filter((x) => x.date === d && x.barber === b.id && x.status !== 'cancelled')}
                        indicator={indicator && indicator.lane === laneId(d, b.id) ? indicator : null}
                        onOpen={setOpenId} draggingId={dragging?.id ?? null} now={now} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? <div className="bk bk-overlay" style={{ height: service(dragging.service).minutes * ppm }}><BlockBody b={dragging} /></div> : null}
        </DragOverlay>
      </DndContext>

      {open ? <BookingDialog booking={open} onClose={() => setOpenId(null)} /> : null}
      {adding ? <AddDialog date={focusDate} staff={staff} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

function Lane({ date, barberId, ppm, openDay, showName, bookings, indicator, onOpen, draggingId, now }: {
  date: string; barberId: BarberId; ppm: number; openDay: boolean; showName: boolean; bookings: Booking[];
  indicator: { start: number; end: number; ok: boolean } | null; onOpen: (id: string) => void; draggingId: string | null; now: Date;
}) {
  const { t } = useFormat();
  const working = openDay && worksOn(barberId, date);
  const { setNodeRef, isOver } = useDroppable({ id: laneId(date, barberId), disabled: !working });
  const b = barber(barberId);
  const nowMin = minutesOf(now);
  return (
    <div ref={setNodeRef} data-lane={laneId(date, barberId)} className={`lane lane-${barberId} ${working ? '' : 'is-off'} ${isOver ? 'is-over' : ''}`} style={{ height: (DAY_END - DAY_START) * ppm }}>
      {showName ? <span className="lane-name">{b.name}</span> : null}
      {working ? (
        <div className="pause" style={{ top: (b.pause[0] - DAY_START) * ppm, height: (b.pause[1] - b.pause[0]) * ppm }}>{t('agenda.pause')}</div>
      ) : null}
      {date === isoDate(now) && nowMin > DAY_START && nowMin < DAY_END ? <div className="now-line" style={{ top: (nowMin - DAY_START) * ppm }} aria-hidden="true" /> : null}
      {bookings.map((x) => <Block key={x.id} b={x} ppm={ppm} onOpen={onOpen} ghost={draggingId === x.id} now={now} />)}
      {indicator ? (
        <div className={`drop-indicator ${indicator.ok ? 'ok' : 'bad'}`} style={{ top: (indicator.start - DAY_START) * ppm, height: (indicator.end - indicator.start) * ppm }}>
          {hhmm(indicator.start)}
        </div>
      ) : null}
    </div>
  );
}

function BlockBody({ b }: { b: Booking }) {
  const { t } = useFormat();
  return (
    <>
      <span className="bk-time">{hhmm(b.start)}–{hhmm(b.start + service(b.service).minutes)}</span>{' '}
      <span className="bk-name">{b.name}</span>{' '}
      <span className="bk-svc">{t(`svc.${b.service}.name` as Key)}</span>
    </>
  );
}

function Block({ b, ppm, onOpen, ghost, now }: { b: Booking; ppm: number; onOpen: (id: string) => void; ghost: boolean; now: Date }) {
  const { t, shortDay } = useFormat();
  const movable = b.status === 'confirmed' && atTime(b.date, b.start) > now;
  const height = Math.max(service(b.service).minutes * ppm, 22);
  const { attributes, listeners, setNodeRef } = useDraggable({ id: b.id, disabled: !movable });
  return (
    <button
      ref={setNodeRef}
      data-booking={b.id}
      type="button"
      className={`bk st-${b.status} ${movable ? 'is-movable' : ''} ${ghost ? 'is-ghost' : ''} ${height < 50 ? 'is-short' : ''}`}
      style={{ top: (b.start - DAY_START) * ppm, height }}
      onClick={() => onOpen(b.id)}
      {...listeners}
      {...attributes}
      // dnd-kit's role="button" duplicates the native one
      role={undefined}
      aria-roledescription={undefined}
      aria-disabled={undefined}
    >
      <BlockBody b={b} />
      <span className="sr">, {shortDay(b.date)}, {t(`status.${b.status}` as Key)}</span>
    </button>
  );
}

function BookingDialog({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, when, money } = useFormat();
  const { confirm, toast } = useFeedback();
  const state = useApp((s) => s);
  const [moving, setMoving] = useState(false);
  const now = useNow();
  const started = atTime(b.date, b.start).getTime() - now.getTime() <= 15 * 60_000;
  const act = async (status: Booking['status']) => {
    if (status === 'cancelled' && !(await confirm({ title: t('account.cancelTitle'), body: `${b.name} · ${when(b.date, b.start)}`, ok: t('agenda.cancel'), cancel: t('account.keep'), danger: true }))) return;
    setStatus(b.id, status);
    toast(`${b.name} · ${t(`status.${status}` as Key)}`);
  };
  return (
    <Dialog open onClose={onClose} title={`${b.name} · ${when(b.date, b.start)}`}>
      <dl className="facts">
        <div><dt>{t('col.service')}</dt><dd>{t(`svc.${b.service}.name` as Key)} · {money(service(b.service).price, 0)}</dd></div>
        <div><dt>{t('col.barber')}</dt><dd>{barber(b.barber).name}</dd></div>
        <div><dt>{t('book.phone')}</dt><dd><a href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a></dd></div>
        <div><dt>{t('col.status')}</dt><dd><span className={`chip st-${b.status}`}>{t(`status.${b.status}` as Key)}</span> · {t(`agenda.source.${b.source}` as Key)} · {b.code}</dd></div>
        {b.note ? <div><dt>{t('book.note')}</dt><dd>« {b.note} »</dd></div> : null}
      </dl>
      {moving ? <MoveForm b={b} state={state} onDone={() => { setMoving(false); onClose(); }} /> : (
        <div className="dialog-actions">
          {b.status === 'confirmed' && started ? <><button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('done')}>{t('agenda.markDone')}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('no-show')}>{t('agenda.markNoShow')}</button></> : null}
          {b.status === 'confirmed' && !started ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoving(true)}>{t('agenda.move')}</button> : null}
          {b.status === 'confirmed' ? <button type="button" className="btn btn-danger btn-sm" onClick={() => void act('cancelled')}>{t('agenda.cancel')}</button> : null}
          {b.status !== 'confirmed' && !started ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('confirmed')}>{t('agenda.restore')}</button> : null}
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>{t('common.close')}</button>
        </div>
      )}
    </Dialog>
  );
}

function MoveForm({ b, state, onDone }: { b: Booking; state: State; onDone: () => void }) {
  const { t, shortDay } = useFormat();
  const { toast } = useFeedback();
  const [date, setDate] = useState(b.date);
  const [who, setWho] = useState<BarberId>(b.barber);
  const copy = { ...state, bookings: state.bookings.filter((x) => x.id !== b.id) };
  const slots = freeSlots(copy, date, b.service, who);
  const [start, setStart] = useState<number | null>(null);
  const chosen = start ?? slots[0]?.start ?? null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (chosen === null) return;
    const error = moveBooking(b.id, { date, start: chosen, barber: who });
    if (error) { toast(t(`err.${error}` as Key), 'err'); return; }
    toast(t('agenda.moved', { when: `${shortDay(date)} ${hhmm(chosen)}`, barber: barber(who).name }));
    onDone();
  };
  return (
    <form className="form" onSubmit={submit}>
      <h3>{t('agenda.moveTitle')}</h3>
      <div className="row2">
        <Field label={t('agenda.day')} type="date" value={date} min={isoDate(new Date())} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setStart(null); } }} />
        <Select label={t('agenda.barber')} value={who} onChange={(e) => { setWho(e.target.value as BarberId); setStart(null); }}>
          {BARBERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </div>
      <Select label={t('agenda.time')} value={chosen ?? ''} onChange={(e) => setStart(Number(e.target.value))}>
        {slots.length ? slots.map((s) => <option key={s.start} value={s.start}>{hhmm(s.start)}</option>) : <option value="">{t('agenda.noSlot')}</option>}
      </Select>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={chosen === null}>{t('agenda.move')}</button>
      </div>
    </form>
  );
}

function AddDialog({ date, staff, onClose }: { date: string; staff: StaffAccount; onClose: () => void }) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const state = useApp((s) => s);
  const [serviceId, setServiceId] = useState<ServiceId>('coupe');
  const [who, setWho] = useState<BarberId>(staff.role === 'barber' ? staff.barber : 'karim');
  const [day, setDay] = useState(date);
  const slots = useMemo(() => freeSlots(state, day, serviceId, who), [state, day, serviceId, who]);
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const chosen = start ?? slots[0]?.start ?? null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = clean(name, 60), p = clean(phone, 20);
    const next: Record<string, string> = {};
    if (!isName(n)) next.name = t('err.name');
    if (!isPhoneFR(p)) next.phone = t('err.phone');
    setErrors(next);
    if (Object.keys(next).length || chosen === null) return;
    const result = book({ service: serviceId, barber: who, date: day, start: chosen, name: n, phone: p, email: '', note: '', source: 'phone' });
    if (!result.ok) { toast(t(`err.${result.error}` as Key), 'err'); return; }
    toast(t('agenda.created', { name: n, time: hhmm(chosen) }));
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={t('agenda.newTitle')} wide>
      <form className="form" noValidate onSubmit={submit}>
        <div className="row2">
          <Select label={t('col.service')} value={serviceId} onChange={(e) => { setServiceId(e.target.value as ServiceId); setStart(null); }}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{t(`svc.${s.id}.name` as Key)}</option>)}
          </Select>
          <Select label={t('agenda.barber')} value={who} disabled={staff.role === 'barber'} onChange={(e) => { setWho(e.target.value as BarberId); setStart(null); }}>
            {BARBERS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <div className="row2">
          <Field label={t('agenda.day')} type="date" value={day} min={isoDate(new Date())} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setStart(null); } }} />
          <Select label={t('agenda.time')} value={chosen ?? ''} onChange={(e) => setStart(Number(e.target.value))}>
            {slots.length ? slots.map((s) => <option key={s.start} value={s.start}>{hhmm(s.start)}</option>) : <option value="">{t('agenda.noSlot')}</option>}
          </Select>
        </div>
        <div className="row2">
          <Field label={t('agenda.client')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Field label={t('book.phone')} type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={chosen === null}>{t('agenda.add').replace('+ ', '')}</button>
        </div>
      </form>
    </Dialog>
  );
}
