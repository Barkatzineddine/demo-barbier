import { useDeferredValue, useMemo, useState } from 'react';
import { BARBERS, barber, service, type BarberId, type StaffAccount } from '../../domain/catalog';
import { atTime, hhmm, isoDate } from '../../domain/dates';
import { BOOKING_STATUSES, type BookingStatus } from '../../domain/schema';
import { useFormat } from '../../format';
import type { Key } from '../../i18n';
import { useApp } from '../../state/app';
import { navigate } from '../../shared/router';
import { clean, csv, download } from '../../shared/security';
import { useFeedback } from '../../shared/ui/Feedback';
import { Field, Select } from '../../shared/ui/Field';

export default function BookingsList({ staff }: { staff: StaffAccount }) {
  const { t, shortDay } = useFormat();
  const { toast } = useFeedback();
  const bookings = useApp((s) => s.bookings);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [who, setWho] = useState<BarberId | ''>(staff.role === 'barber' ? staff.barber : '');
  const [status, setStatusFilter] = useState<BookingStatus | ''>('');

  const list = useMemo(() => {
    const now = new Date();
    const needle = clean(query, 40).toLowerCase();
    return bookings.filter((b) => {
      const when = atTime(b.date, b.start);
      if (period === 'upcoming' && when < now) return false;
      if (period === 'past' && when >= now) return false;
      if (who && b.barber !== who) return false;
      if (status && b.status !== status) return false;
      return !needle || `${b.name} ${b.code} ${b.phone}`.toLowerCase().includes(needle);
    }).sort((a, b) => (period === 'past' ? -1 : 1) * (atTime(a.date, a.start).getTime() - atTime(b.date, b.start).getTime()));
  }, [bookings, query, period, who, status]);

  const exportCsv = () => {
    const rows = [[t('col.date'), t('col.time'), t('col.client'), t('book.phone'), t('contact.email'), t('col.service'), 'Prix', t('col.barber'), t('col.status'), t('col.source'), t('account.code'), t('book.note')],
      ...list.map((b) => [b.date, hhmm(b.start), b.name, b.phone, b.email, t(`svc.${b.service}.name` as Key), service(b.service).price, barber(b.barber).name, t(`status.${b.status}` as Key), t(`agenda.source.${b.source}` as Key), b.code, b.note])];
    download(`reservations-${isoDate(new Date())}.csv`, csv(rows), 'text/csv;charset=utf-8');
    toast(t('list.exported', { n: list.length }));
  };

  return (
    <section>
      <div className="filters">
        <Field label={t('list.search')} type="search" placeholder={t('list.searchPh')} maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label={t('list.period')} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
          <option value="upcoming">{t('list.upcoming')}</option><option value="past">{t('list.past')}</option><option value="all">{t('common.all')}</option>
        </Select>
        {staff.role === 'manager' ? (
          <Select label={t('col.barber')} value={who} onChange={(e) => setWho(e.target.value as BarberId | '')}>
            <option value="">{t('common.all')}</option>
            {BARBERS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        ) : null}
        <Select label={t('list.status')} value={status} onChange={(e) => setStatusFilter(e.target.value as BookingStatus | '')}>
          <option value="">{t('common.all')}</option>
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as Key)}</option>)}
        </Select>
        <button type="button" className="btn btn-ghost" onClick={exportCsv}>{t('list.export')}</button>
      </div>
      <p className="hint" aria-live="polite">{t('list.count', { n: list.length })}</p>
      <div className="table-scroll">
        <table className="table">
          <thead><tr>{['col.date', 'col.time', 'col.client', 'col.service', 'col.barber', 'col.status', 'col.source'].map((k) => <th key={k} scope="col">{t(k as Key)}</th>)}</tr></thead>
          <tbody>
            {list.slice(0, 150).map((b) => (
              <tr key={b.id} className={`st-${b.status}`} onClick={() => navigate(`/equipe?tab=agenda&d=${b.date}&b=${b.id}`)}>
                <td>{shortDay(b.date)}</td>
                <td>{hhmm(b.start)}</td>
                <td><button type="button" className="linklike" onClick={(e) => { e.stopPropagation(); navigate(`/equipe?tab=agenda&d=${b.date}&b=${b.id}`); }}>{b.name}</button><br /><span className="hint">{b.phone} · {b.code}</span></td>
                <td>{t(`svc.${b.service}.name` as Key)}</td>
                <td>{barber(b.barber).name}</td>
                <td><span className={`chip st-${b.status}`}>{t(`status.${b.status}` as Key)}</span></td>
                <td>{t(`agenda.source.${b.source}` as Key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
