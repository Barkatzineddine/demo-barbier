import { useEffect, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { BARBERS, HOURS, SERVICES } from '../domain/catalog';
import { addDays, hhmm, isoDate, minutesOf } from '../domain/dates';
import { dayInfo } from '../domain/slots';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { sendMessage, useApp } from '../state/app';
import { Link, usePage } from '../shared/router';
import { useFormGuard } from '../shared/formGuard';
import { clean, isEmail, isName } from '../shared/security';
import { Dialog } from '../shared/ui/Dialog';
import { useFeedback } from '../shared/ui/Feedback';
import { Checkbox, Field, Honeypot, Select, TextArea } from '../shared/ui/Field';

const img = (name: string) => `${import.meta.env.BASE_URL}img/${name}`;
const GALLERY = ['164', '166', '168', '177', '181', '182', '185', '163'] as const;

export function Home() {
  const { t } = useFormat();
  usePage(t('title.home'));
  return (
    <>
      <Hero />
      <Services />
      <Gallery />
      <Team />
      <Infos />
      <Contact />
    </>
  );
}

function OpenStatus() {
  const { t, date } = useFormat();
  const closures = useApp((s) => s.closures);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const today = isoDate(now);
  const min = minutesOf(now);
  const info = dayInfo({ closures }, today);
  if (info.open && min >= info.from && min < info.to) return <p className="status is-open" data-volatile>{t('status.open', { time: hhmm(info.to) })}</p>;
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const inf = dayInfo({ closures }, d);
    if (!inf.open || (i === 0 && min >= inf.from)) continue;
    const when = i === 0 ? t('status.today') : i === 1 ? t('status.tomorrow') : date(d, { weekday: 'long' });
    return <p className="status is-closed" data-volatile>{t('status.closed', { when, time: hhmm(inf.from) })}</p>;
  }
  return null;
}

function Hero() {
  const { t } = useFormat();
  return (
    <section className="hero" aria-labelledby="hero-title">
      <img
        className="hero-img"
        src={img('hero-1024.webp')}
        srcSet={`${img('hero-640.webp')} 640w, ${img('hero-1024.webp')} 1024w, ${img('hero-1600.webp')} 1600w`}
        sizes="100vw" width={1600} height={1067} alt={t('hero.alt')} fetchPriority="high"
      />
      <div className="wrap hero-content">
        <p className="eyebrow">{t('hero.eyebrow')}</p>
        <h1 id="hero-title" className="reveal" tabIndex={-1}>{t('hero.title1')}<br /><em>{t('hero.title2')}</em></h1>
        <p className="lead">{t('hero.lead')}</p>
        <div className="hero-actions">
          <Link to="/reserver" className="btn btn-primary btn-lg">{t('hero.book')}</Link>
          <a className="btn btn-ghost btn-lg" href="#prestations">{t('hero.prices')}</a>
        </div>
        <OpenStatus />
      </div>
    </section>
  );
}

function Services() {
  const { t, duration, money } = useFormat();
  return (
    <section className="section" id="prestations" aria-labelledby="t-prestations">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">{t('services.eyebrow')}</p>
          <h2 id="t-prestations">{t('services.title')}</h2>
          <p>{t('services.intro')}</p>
        </div>
        <ul className="price-list">
          {SERVICES.map((s) => (
            <li key={s.id} className="price-item">
              <div className="pi-main">
                <h3>{t(`svc.${s.id}.name` as Key)}</h3>
                <span className="leader" aria-hidden="true" />
                <span className="price">{money(s.price, 0)}</span>
              </div>
              <p>{t(`svc.${s.id}.desc` as Key)} <span className="dur">{duration(s.minutes)}</span></p>
              <Link className="pi-book" to={`/reserver?s=${s.id}`}>{t('services.book')}<span className="sr"> · {t(`svc.${s.id}.name` as Key)}</span></Link>
            </li>
          ))}
        </ul>
        <p className="note">{t('services.note')}</p>
      </div>
    </section>
  );
}

function Gallery() {
  const { t } = useFormat();
  const [index, setIndex] = useState<number | null>(null);
  const show = (i: number) => setIndex((i + GALLERY.length) % GALLERY.length);
  const current = index === null ? null : GALLERY[index];
  const [touchX, setTouchX] = useState<number | null>(null);
  return (
    <section className="section section-alt" id="galerie" aria-labelledby="t-galerie">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">{t('gallery.eyebrow')}</p>
          <h2 id="t-galerie">{t('gallery.title')}</h2>
        </div>
        <ul className="gallery">
          {GALLERY.map((g, i) => (
            <li key={g}>
              <button type="button" className="g-item" onClick={() => show(i)} aria-label={`${t('gallery.open')} : ${t(`g.${g}` as Key)}`}>
                <img src={img(`g${g}-480.webp`)} width={480} height={600} loading="lazy" decoding="async" alt="" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Dialog open={current !== null} onClose={() => setIndex(null)} title={current ? t(`g.${current}` as Key) : ''} className="lightbox">
        {current ? (
          <div
            onKeyDown={(e) => { if (e.key === 'ArrowLeft') show((index ?? 0) - 1); if (e.key === 'ArrowRight') show((index ?? 0) + 1); }}
            onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touchX !== null && x !== undefined && Math.abs(x - touchX) > 50) show((index ?? 0) + (x < touchX ? 1 : -1)); setTouchX(null); }}
          >
            <img src={img(`g${current}-960.webp`)} alt={t(`g.${current}` as Key)} width={960} height={1200} />
            <p className="muted">{(index ?? 0) + 1}/{GALLERY.length}</p>
            <div className="lb-nav">
              <button type="button" className="btn btn-ghost" onClick={() => show((index ?? 0) - 1)}>{t('gallery.prev')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setIndex(null)}>{t('common.close')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => show((index ?? 0) + 1)} data-autofocus>{t('gallery.next')}</button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function Team() {
  const { t, locale } = useFormat();
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + d));
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  return (
    <section className="section" id="equipe" aria-labelledby="t-equipe">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">{t('team.eyebrow')}</p>
          <h2 id="t-equipe">{t('team.title')}</h2>
        </div>
        <ul className="team">
          {BARBERS.map((b) => (
            <li key={b.id} className="member">
              <span className="mono" aria-hidden="true">{b.name[0]}</span>
              <h3>{b.name}</h3>
              <p className="role">{t(`team.${b.id}.role` as Key)}</p>
              <p>{t(`team.${b.id}.bio` as Key)}</p>
              <p className="days">{t('team.days', { days: list.format(b.days.map(dayName)) })}</p>
            </li>
          ))}
        </ul>
        <ul className="promises">
          <li>{t('promise.1')}</li><li>{t('promise.2')}</li><li>{t('promise.3')}</li>
        </ul>
      </div>
    </section>
  );
}

function Infos() {
  const { t, locale } = useFormat();
  const today = new Date().getDay();
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + d));
  return (
    <section className="section section-alt" id="infos" aria-labelledby="t-infos">
      <div className="wrap infos">
        <div>
          <p className="eyebrow">{t('infos.eyebrow')}</p>
          <h2 id="t-infos">{t('infos.title')}</h2>
          <table className="hours">
            <caption className="sr">{t('infos.caption')}</caption>
            <tbody>
              {order.map((d) => {
                const h = HOURS[d];
                return (
                  <tr key={d} className={d === today ? 'today' : undefined}>
                    <th scope="row">{dayName(d)}{d === today ? <span className="today-mark" data-volatile> · {t('infos.todayMark')}</span> : null}</th>
                    <td>{h ? `${hhmm(h[0])} – ${hhmm(h[1])}` : t('infos.closed')}{d === 4 ? <span className="tag">{t('infos.late')}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="note">{t('infos.holidays')}</p>
        </div>
        <div className="access">
          <figure className="map" aria-hidden="true">
            <svg viewBox="0 0 400 260">
              <rect width="400" height="260" fill="#1b1916" />
              <path d="M-10 40 C 60 70, 70 140, 40 270" fill="none" stroke="#2c3a40" strokeWidth="22" />
              <path d="M330 -10 C 300 80, 360 160, 320 270" fill="none" stroke="#2c3a40" strokeWidth="30" />
              <g stroke="#34302a" strokeWidth="7" fill="none" strokeLinecap="round">
                <path d="M70 60 L 300 90" /><path d="M60 150 L 320 170" /><path d="M120 20 L 150 250" /><path d="M230 10 L 210 250" /><path d="M80 210 L 300 230" /><path d="M150 100 C 170 120, 190 120, 220 105" />
              </g>
              <circle cx="183" cy="118" r="10" fill="#c9a063" /><circle cx="183" cy="118" r="4" fill="#1b1916" />
              <text x="196" y="112" fill="#efe7da" fontSize="13" fontFamily="sans-serif">Maison Corbin</text>
            </svg>
          </figure>
          <address>
            <strong>Maison Corbin</strong><br />14 montée du Corbeau, 69001 Lyon<br />{t('infos.metro')}<br />
            <a href="tel:+33465712348">04 65 71 23 48</a>
          </address>
          <p className="map-links">
            <a className="btn btn-ghost" href="https://www.openstreetmap.org/?mlat=45.7700&mlon=4.8350#map=17/45.7700/4.8350" rel="noopener noreferrer" target="_blank">{t('infos.map')}<span className="sr"> {t('infos.newTab')}</span></a>
            <a className="btn btn-ghost" href="https://www.google.com/maps/dir/?api=1&destination=45.7700,4.8350" rel="noopener noreferrer" target="_blank">{t('infos.route')}<span className="sr"> {t('infos.newTab')}</span></a>
          </p>
          <p className="note">{t('infos.fictional')}</p>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const guard = useFormGuard({ key: 'corbin:contact', max: 3, windowMs: 10 * 60_000 });
  const [values, setValues] = useState({ name: '', email: '', subject: '1', message: '', consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof values, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = clean(values.name, 60), email = clean(values.email, 254).toLowerCase(), message = clean(values.message, 1000, true);
    const next: Record<string, string> = {};
    if (!isName(name)) next.name = t('err.name');
    if (!isEmail(email)) next.email = t('err.email');
    if (message.length < 10) next.message = t('err.message');
    if (!values.consent) next.consent = t('err.consent');
    flushSync(() => setErrors(next)); // render the errors first, then focus the first one
    if (Object.keys(next).length) { document.querySelector<HTMLElement>('#contact [aria-invalid="true"]')?.focus(); return; }
    const verdict = guard.check(message);
    if (!verdict.ok) {
      if (verdict.silent) { setValues({ name: '', email: '', subject: '1', message: '', consent: false }); toast(t('contact.sent')); return; }
      toast(verdict.reason === 'too-fast' ? t('err.tooFast') : verdict.reason === 'too-many-links' ? t('err.links') : t('err.rate', { n: verdict.waitMinutes ?? 1 }), 'err');
      return;
    }
    verdict.commit();
    sendMessage({ name, email, subject: t(`contact.subject.${values.subject}` as Key), message });
    setValues({ name: '', email: '', subject: '1', message: '', consent: false });
    toast(t('contact.sent'));
  };

  return (
    <section className="section" id="contact" aria-labelledby="t-contact">
      <div className="wrap contact">
        <div>
          <p className="eyebrow">{t('contact.eyebrow')}</p>
          <h2 id="t-contact">{t('contact.title')}</h2>
          <p>{t('contact.intro')} <Link to="/reserver">{t('nav.book')} →</Link></p>
        </div>
        <form className="card form" noValidate onSubmit={submit}>
          <Field label={t('contact.name')} name="name" autoComplete="name" maxLength={60} value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Field label={t('contact.email')} name="email" type="email" autoComplete="email" maxLength={254} value={values.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <Select label={t('contact.subject')} value={values.subject} onChange={(e) => set('subject', e.target.value)}>
            {['1', '2', '3', '4'].map((k) => <option key={k} value={k}>{t(`contact.subject.${k}` as Key)}</option>)}
          </Select>
          <TextArea label={t('contact.message')} rows={5} maxLength={1000} value={values.message} onChange={(e) => set('message', e.target.value)} error={errors.message} hint={t('contact.count', { n: values.message.length })} />
          <Checkbox label={t('contact.consent')} checked={values.consent} onChange={(e) => set('consent', e.target.checked)} error={errors.consent} />
          <Honeypot inputRef={guard.honeypotRef} label={t('honeypot')} />
          <button className="btn btn-primary" type="submit">{t('contact.send')}</button>
        </form>
      </div>
    </section>
  );
}
