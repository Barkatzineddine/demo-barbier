import { useState, type FormEvent } from 'react';
import { addDays, isoDate } from '../../domain/dates';
import { holiday } from '../../domain/holidays';
import { useFormat } from '../../format';
import type { Key } from '../../i18n';
import { addClosure, app, removeClosure, useApp } from '../../state/app';
import { clean } from '../../shared/security';
import { useFeedback } from '../../shared/ui/Feedback';
import { Field } from '../../shared/ui/Field';

export default function Closures() {
  const { t, date: fmt } = useFormat();
  const { confirm, toast } = useFeedback();
  const closures = useApp((s) => s.closures);
  const today = isoDate(new Date());
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) { setError(t('closures.future')); return; }
    if (closures.some((c) => c.date === date)) { setError(t('closures.exists')); return; }
    setError(null);
    const affected = app.get().bookings.filter((b) => b.date === date && b.status === 'confirmed');
    if (affected.length && !(await confirm({ title: fmt(date), body: t('closures.warn', { n: affected.length }), ok: t('closures.submit'), cancel: t('common.cancel') }))) return;
    addClosure(date, clean(reason, 80) || '—');
    setDate(''); setReason('');
    toast(t('closures.done'));
  };

  const upcoming = closures.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const holidays: [string, string][] = [];
  for (let i = 0; i < 400 && holidays.length < 4; i++) { const d = addDays(today, i); const h = holiday(d); if (h) holidays.push([d, t(`hol.${h}` as Key)]); }

  return (
    <div className="closures">
      <form className="card form" noValidate onSubmit={(e) => void submit(e)}>
        <h2 className="h-card">{t('closures.add')}</h2>
        <div className="row2">
          <Field label={t('closures.date')} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} error={error} />
          <Field label={t('closures.reason')} maxLength={80} placeholder={t('closures.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">{t('closures.submit')}</button>
      </form>
      <h2 className="sub-title">{t('closures.upcoming')}</h2>
      {upcoming.length ? (
        <ul className="plain-list">
          {upcoming.map((c) => (
            <li key={c.date} className="card row-between">
              <span><strong>{fmt(c.date)}</strong> · {c.reason}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeClosure(c.date)}>{t('closures.reopen')}</button>
            </li>
          ))}
        </ul>
      ) : <p className="hint">{t('closures.none')}</p>}
      <h2 className="sub-title">{t('closures.holidays')}</h2>
      <ul className="plain-list hint">{holidays.map(([d, n]) => <li key={d}>{fmt(d)} · {n}</li>)}</ul>
    </div>
  );
}
