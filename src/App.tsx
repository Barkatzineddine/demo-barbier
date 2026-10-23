import { lazy, Suspense, useEffect, useState } from 'react';
import { barber } from './domain/catalog';
import { useFormat } from './format';
import { Home } from './pages/Home';
import { app } from './state/app';
import { deviceBookingIds, useSession } from './state/session';
import { Link, match, navigate, useLocation, useScrollOnNavigate } from './shared/router';
import { usePrerenderHandoff } from './shared/prerender';
import { onInstallPrompt } from './shared/sw';
import { FeedbackProvider, useFeedback } from './shared/ui/Feedback';

// heavier screens are split out of the first download
const Booking = lazy(() => import('./pages/Booking'));
const Account = lazy(() => import('./pages/Account'));
const Staff = lazy(() => import('./pages/staff/Staff'));
const Confirmation = lazy(() => import('./pages/Booking').then((m) => ({ default: m.ConfirmationPage })));

export function App() {
  const { t } = useFormat();
  usePrerenderHandoff();
  return (
    <FeedbackProvider closeLabel={t('common.close')}>
      <Shell />
    </FeedbackProvider>
  );
}

function Shell() {
  const location = useLocation();
  useScrollOnNavigate(location);
  const { path, query } = location;
  const inStaff = match('/equipe', path) !== null;
  const confirmation = match('/rdv/:id', path);

  return (
    <>
      <a className="skip" href="#contenu">{useFormat().t('nav.skip')}</a>
      <DemoBar />
      <Header />
      <LiveNotifications />
      <main id="contenu" tabIndex={-1}>
        <Suspense fallback={<div className="route-loading" aria-hidden="true" />}>
          {path === '/' ? <Home /> : null}
          {path === '/reserver' ? <Booking preset={query.get('s')} /> : null}
          {path === '/compte' ? <Account /> : null}
          {inStaff ? <Staff /> : null}
          {confirmation?.id ? <Confirmation id={confirmation.id} /> : null}
          {!['/', '/reserver', '/compte'].includes(path) && !inStaff && !confirmation ? <Home /> : null}
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function DemoBar() {
  const { t, lang, setLang } = useFormat();
  const { confirm, toast } = useFeedback();
  // offered in a toast: a button appearing in the bar would push the page down (layout shift)
  useEffect(() => onInstallPrompt((show) => { if (show) toast(t('demo.installable'), 'info', { label: t('demo.install'), run: () => void show() }); }), [t, toast]);
  const reset = async () => {
    const ok = await confirm({ title: t('demo.resetTitle'), body: t('demo.resetBody'), ok: t('demo.reset'), cancel: t('common.cancel'), danger: true });
    if (!ok) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('corbin:') && k !== 'corbin:lang').forEach((k) => localStorage.removeItem(k));
      Object.keys(localStorage).filter((k) => k.startsWith('antispam:')).forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch { /* storage blocked */ }
    app.reset();
    window.location.hash = '';
    window.location.reload();
  };
  return (
    <div className="demo-bar">
      <p><strong>{t('demo.label')}</strong> · {t('demo.text')} <a href="https://barkatzineddine.github.io/#contact">{t('demo.cta')}</a></p>
      <div className="demo-actions">
        <button type="button" className="demo-btn" title={t('lang.label')} onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} lang={lang === 'fr' ? 'en' : 'fr'}>{t('lang.switch')}</button>
        <button type="button" className="demo-btn" onClick={() => void reset()}>{t('demo.reset')}</button>
      </div>
    </div>
  );
}

function Header() {
  const { t } = useFormat();
  const { path } = useLocation();
  // the menu belongs to the page it was opened on, so it closes itself on navigation
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (value: boolean) => setOpenOn(value ? path : null);
  const session = useSession((s) => s.session);
  const nav: [string, string][] = [['#prestations', t('nav.services')], ['#galerie', t('nav.gallery')], ['#equipe', t('nav.team')], ['#infos', t('nav.infos')], ['#contact', t('nav.contact')]];
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link to="/" className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 25c4-1 7-4 9-9 1 4 4 7 9 8-3 1-5 3-6 6-1-2-2-3-3-3s-3 2-4 3c0-2-2-4-5-5z" fill="currentColor" /></svg>
          <span><span className="brand-name">Maison Corbin</span><span className="brand-sub">{t('brand.sub')}</span></span>
        </Link>
        <button type="button" className="menu-btn" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>{t('nav.menu')}</button>
        <nav id="nav" className={`nav ${open ? 'open' : ''}`} aria-label={t('nav.label')}>
          {nav.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
          <Link to={session?.kind === 'staff' ? '/equipe' : '/compte'} aria-current={path === '/compte' ? 'page' : undefined}>
            {session?.kind === 'staff' ? t('nav.staff') : t('nav.account')}
          </Link>
          <Link to="/reserver" className="btn btn-primary nav-cta" aria-current={path === '/reserver' ? 'page' : undefined}>{t('nav.book')}</Link>
        </nav>
      </div>
    </header>
  );
}

/** Messages from the other tabs (BroadcastChannel): staff see new bookings live. */
function LiveNotifications() {
  const { t, when } = useFormat();
  const { toast } = useFeedback();
  const session = useSession((s) => s.session);
  useEffect(() => app.onRemoteEvent((event) => {
    const b = typeof event.id === 'string' ? app.get().bookings.find((x) => x.id === event.id) : undefined;
    if (event.type === 'message.received' && session?.kind === 'staff') toast(t('live.message'), 'info');
    if (!b) return;
    const params = { name: b.name, when: `${when(b.date, b.start)} (${barber(b.barber).name})` };
    if (session?.kind === 'staff') {
      if (event.type === 'booking.created') toast(t('live.created', params), 'info', { label: t('staff.tab.agenda'), run: () => navigate(`/equipe?d=${b.date}`) });
      if (event.type === 'booking.cancelled') toast(t('live.cancelled', params), 'info');
    } else if (event.type === 'booking.moved') {
      // only the customer who owns the booking hears about it
      const mine = deviceBookingIds().includes(b.id) || (session?.kind === 'client' && b.clientId === session.client.id);
      if (mine) toast(t('live.yoursMoved', { when: params.when }), 'info');
    }
  }), [session, t, toast, when]);
  return null;
}

function Footer() {
  const { t } = useFormat();
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <p className="brand-name">Maison Corbin</p>
          <p>14 montée du Corbeau, 69001 Lyon<br /><a href="tel:+33465712348">04 65 71 23 48</a> · <a href="mailto:contact@maison-corbin.example">contact@maison-corbin.example</a></p>
          <p><Link to="/equipe">{t('nav.staff')}</Link> · <Link to="/compte">{t('nav.account')}</Link></p>
        </div>
        <div id="securite">
          <h2 className="footer-title">{t('footer.security')}</h2>
          <ul className="sec-list">
            <li>{t('footer.sec.1')}</li><li>{t('footer.sec.2')}</li><li>{t('footer.sec.3')}</li><li>{t('footer.sec.4')}</li>
          </ul>
        </div>
        <div>
          <h2 className="footer-title">{t('footer.demo')}</h2>
          <p>{t('footer.fiction')}</p>
          <p>{t('footer.engineering')}</p>
          <p>{t('footer.by', { name: 'Zineddine Barkat' }).split('Zineddine Barkat')[0]}<a href="https://barkatzineddine.github.io/#contact">Zineddine Barkat</a>{t('footer.by', { name: 'Zineddine Barkat' }).split('Zineddine Barkat')[1]} <a href="https://github.com/Barkatzineddine/demo-barbier">{t('footer.code')}</a></p>
        </div>
      </div>
    </footer>
  );
}
