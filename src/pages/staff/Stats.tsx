// Staff statistics: one series per chart, thin bars, values on hover/focus and a data table twin.
import { useMemo, useState, type CSSProperties } from 'react';
import { BARBERS, HOURS, service, type StaffAccount } from '../../domain/catalog';
import { addDays, isoDate, startOfWeek, weekday } from '../../domain/dates';
import { fillRate } from '../../domain/slots';
import { useFormat } from '../../format';
import { useApp } from '../../state/app';

export default function Stats({ staff }: { staff: StaffAccount }) {
  const { t, money, date, locale } = useFormat();
  const state = useApp((s) => s);
  const mine = (b: { barber: string }) => staff.role === 'manager' || b.barber === staff.barber;
  const today = isoDate(new Date());

  const weeks = useMemo(() => {
    const monday = startOfWeek(today);
    return Array.from({ length: 8 }, (_, i) => addDays(monday, (i - 7) * 7)).map((start) => {
      const end = addDays(start, 7);
      const done = state.bookings.filter((b) => mine(b) && b.status === 'done' && b.date >= start && b.date < end);
      return { start, value: done.reduce((s, b) => s + service(b.service).price, 0), count: done.length };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bookings, today, staff]);

  const heat = useMemo(() => {
    const from = addDays(today, -42);
    const hours = Array.from({ length: 12 }, (_, i) => 9 + i);
    const days = [2, 3, 4, 5, 6];
    const grid = days.map((d) => hours.map((h) => state.bookings.filter((b) => mine(b) && b.status !== 'cancelled' && b.date >= from && b.date < today && weekday(b.date) === d && Math.floor(b.start / 60) === h).length));
    return { hours, days, grid, max: Math.max(1, ...grid.flat()) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bookings, today, staff]);

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const perBarber = BARBERS.filter((b) => staff.role === 'manager' || b.id === staff.barber).map((b) => ({
    id: b.id, name: b.name, value: Math.round(fillRate(state, week, b.id) * 100),
  }));
  const past = state.bookings.filter((b) => mine(b) && b.date >= addDays(today, -42) && b.date < today && (b.status === 'done' || b.status === 'no-show'));
  const noShow = past.length ? Math.round((past.filter((b) => b.status === 'no-show').length / past.length) * 1000) / 10 : 0;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.value));
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + d));

  return (
    <div className="stats">
      <figure className="card chart">
        <figcaption><h2 className="h-card">{t('stats.revenue')}</h2><p className="hint">{t('stats.revenueSub')}</p></figcaption>
        <ol className="bars" aria-label={t('stats.revenue')}>
          {weeks.map((w, i) => (
            <Bar key={w.start} label={date(w.start, { day: 'numeric', month: 'short' })} value={w.value} max={maxWeek}
              text={money(w.value, 0)} emphasise={i === weeks.length - 1 || w.value === maxWeek} detail={`${t('stats.week', { date: date(w.start, { day: 'numeric', month: 'long' }) })} · ${w.count}`} />
          ))}
        </ol>
        <details className="data-table"><summary>{t('stats.table')}</summary>
          <table className="table"><tbody>{weeks.map((w) => <tr key={w.start}><th scope="row">{t('stats.week', { date: date(w.start, { day: 'numeric', month: 'long' }) })}</th><td>{money(w.value, 0)}</td><td>{w.count}</td></tr>)}</tbody></table>
        </details>
      </figure>

      <figure className="card chart">
        <figcaption><h2 className="h-card">{t('stats.heat')}</h2><p className="hint">{t('stats.heatSub')}</p></figcaption>
        <div className="heat" role="table" aria-label={t('stats.heat')}>
          <div role="row" className="heat-row heat-head">
            <span role="columnheader" />
            {heat.hours.map((h) => <span key={h} role="columnheader">{h}h</span>)}
          </div>
          {heat.days.map((d, i) => (
            <div role="row" className="heat-row" key={d}>
              <span role="rowheader">{dayName(d)}</span>
              {heat.hours.map((h, j) => {
                const n = heat.grid[i]?.[j] ?? 0;
                const hours = HOURS[d];
                const closed = !hours || h * 60 >= hours[1] || (h + 1) * 60 <= hours[0];
                return <span key={h} role="cell" className={`heat-cell ${closed ? 'is-closed' : ''}`} style={{ '--v': n / heat.max } as CSSProperties} title={`${dayName(d)} ${h}h : ${n}`}>{closed ? '' : n}</span>;
              })}
            </div>
          ))}
        </div>
      </figure>

      <div className="stats-row">
        <section className="card">
          <h2 className="h-card">{t('stats.barbers')}</h2>
          <ul className="hbars">
            {perBarber.map((b) => <li key={b.id} className={`lane-${b.id}`}><span>{b.name}</span><span className="hb-track"><span className="hb-bar" style={{ width: `${Math.min(100, b.value)}%` }} /><span className="hb-val">{b.value} %</span></span></li>)}
          </ul>
        </section>
        <section className="card kpi-big">
          <h2 className="h-card">{t('stats.noShow')}</h2>
          <p className="big-number">{noShow.toLocaleString(locale)} %</p>
        </section>
      </div>
    </div>
  );
}

function Bar({ label, value, max, text, emphasise, detail }: { label: string; value: number; max: number; text: string; emphasise: boolean; detail: string }) {
  const [hover, setHover] = useState(false);
  return (
    <li className="bar-col" tabIndex={0} aria-label={`${detail} : ${text}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className="bar-val">{emphasise || hover ? text : ''}</span>
      <span className="bar-track"><span className="bar" style={{ height: `${Math.max((value / max) * 100, 2)}%` }} /></span>
      <span className="bar-lab">{label}</span>
      {hover ? <span className="bar-tip" role="tooltip">{detail}<br /><strong>{text}</strong></span> : null}
    </li>
  );
}
