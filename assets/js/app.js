import { $, $$, clean, valid, fieldError, guard, honeypot, createStore, demoBanner, toast, uid, hhmm, isoDate } from './core.js';
import { STORE_KEY, seed, validState, dayInfo } from './data.js';

export const store = createStore(STORE_KEY, seed, validState);

demoBanner({ prefix: 'corbin:' });

// ---------- Mobile menu ----------
const menuBtn = $('.menu-btn');
const nav = $('#nav');
menuBtn.addEventListener('click', () => {
  const open = menuBtn.getAttribute('aria-expanded') !== 'true';
  menuBtn.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('open', open);
});
nav.addEventListener('click', (e) => {
  if (e.target.closest('a')) { menuBtn.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }
});

// ---------- Open now / next opening ----------
function openStatus() {
  const el = $('#open-status');
  const now = new Date();
  const state = store.get();
  const today = isoDate(now);
  const min = now.getHours() * 60 + now.getMinutes();
  const info = dayInfo(state, today);
  $$('#hours tr').forEach((tr) => tr.classList.toggle('today', +tr.dataset.day === now.getDay()));
  if (info.open && min >= info.from && min < info.to) {
    el.textContent = `Ouvert maintenant · jusqu'à ${hhmm(info.to)}`;
    el.className = 'status is-open';
    return;
  }
  for (let i = 0; i < 14; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const inf = dayInfo(state, isoDate(d));
    if (!inf.open || (i === 0 && min >= inf.from)) continue;
    const when = i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d);
    el.textContent = `Fermé · ouvre ${when} à ${hhmm(inf.from)}`;
    el.className = 'status is-closed';
    return;
  }
}
openStatus();
setInterval(openStatus, 60e3);

// ---------- Gallery lightbox ----------
const lb = $('#lightbox');
const lbImg = $('#lb-img');
const lbCap = $('#lb-cap');
const items = $$('.g-item img');
let current = 0;
function showPhoto(i) {
  current = (i + items.length) % items.length;
  const img = items[current];
  lbImg.src = img.dataset.full;
  lbImg.alt = img.alt;
  lbCap.textContent = `${img.alt} (${current + 1}/${items.length})`;
}
$$('.g-item').forEach((btn, i) => btn.addEventListener('click', () => { showPhoto(i); lb.showModal(); }));
$('#lb-prev').addEventListener('click', () => showPhoto(current - 1));
$('#lb-next').addEventListener('click', () => showPhoto(current + 1));
$('#lb-close').addEventListener('click', () => lb.close());
lb.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showPhoto(current - 1);
  if (e.key === 'ArrowRight') showPhoto(current + 1);
});
lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
let touchX = null;
lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) showPhoto(current + (dx < 0 ? 1 : -1));
  touchX = null;
});

// ---------- Contact form ----------
const form = $('#contact-form');
form.querySelector('button[type=submit]').before(honeypot('website'));
const contactGuard = guard(form, { key: 'corbin:contact', max: 3, windowMs: 10 * 60e3 });
const msg = $('#c-msg');
msg.addEventListener('input', () => { $('#c-count').textContent = msg.value.length; });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = clean(form.name.value, 60);
  const email = clean(form.email.value, 254).toLowerCase();
  const message = clean(msg.value, 1000, true);
  const subject = clean(form.subject.value, 60);
  let ok = fieldError(form.name, valid.name(name) ? '' : 'Indiquez votre nom (lettres uniquement).');
  ok = fieldError(form.email, valid.email(email) ? '' : 'Adresse e-mail invalide.') && ok;
  ok = fieldError(msg, message.length >= 10 ? '' : 'Votre message doit faire au moins 10 caractères.') && ok;
  ok = fieldError(form.consent, form.consent.checked ? '' : 'Merci de cocher cette case.') && ok;
  if (!ok) { form.querySelector('[aria-invalid=true]')?.focus(); return; }
  const verdict = contactGuard.check(message);
  if (verdict.silent) { form.reset(); toast('Message envoyé.'); return; } // honeypot: bot gets a fake success
  if (!verdict.ok) { toast(verdict.msg, 'err'); return; }
  verdict.commit();
  store.update((s) => s.messages.unshift({ id: uid('m'), name, email, subject, message, read: false, at: new Date().toISOString() }));
  form.reset();
  $('#c-count').textContent = '0';
  contactGuard.arm();
  toast("Message envoyé. Il apparaît dans l'espace gérant (démo).");
});

// ---------- Router ----------
const home = $('#home');
const views = {
  '#/reserver': { el: $('#view-booking'), load: () => import('./booking.js') },
  '#/mes-rendez-vous': { el: $('#view-mine'), load: () => import('./mine.js') },
  '#/gerant': { el: $('#view-owner'), load: () => import('./owner.js') },
};
let cleanup = null;
async function route() {
  const [path, query = ''] = location.hash.split('?');
  const view = views[path];
  cleanup?.(); cleanup = null;
  Object.values(views).forEach((v) => { v.el.hidden = v !== view; });
  home.hidden = Boolean(view);
  document.body.classList.toggle('in-view', Boolean(view));
  if (view) {
    const mod = await view.load();
    cleanup = mod.render(view.el, store, new URLSearchParams(query)) || null;
    window.scrollTo(0, 0);
    view.el.querySelector('h1')?.focus();
  } else if (path.length > 1) {
    document.getElementById(path.slice(1))?.scrollIntoView();
  }
  $$('.nav a').forEach((a) => {
    if (a.getAttribute('href') === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', route);
route();
