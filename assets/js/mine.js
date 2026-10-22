// "Mes rendez-vous": bookings made from this device, plus lookup by code + phone.
import { h, mount, clean, normPhone, toast, confirmDialog, euro0, hhmm, fmtDay, fieldError } from './core.js';
import { service, barber, bookingDate } from './data.js';
import { mineIds, rememberMine, canCancel, icsFor } from './shared.js';

const STATUS_LABEL = { 'confirmé': 'Confirmé', 'terminé': 'Passé', absent: 'Absent', 'annulé': 'Annulé' };

// 5 wrong lookups -> 60 s pause (slows down code guessing)
const LOCK_KEY = 'corbin:lookup-fails';
function fails() { try { return JSON.parse(sessionStorage.getItem(LOCK_KEY)) || []; } catch { return []; } }
function failed() { try { sessionStorage.setItem(LOCK_KEY, JSON.stringify([...fails(), Date.now()].slice(-5))); } catch { /* blocked */ } }
function lockedFor() {
  const f = fails();
  if (f.length < 5) return 0;
  const left = 60e3 - (Date.now() - f[f.length - 1]);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

export function render(root, store) {
  let found = null;

  function card(b) {
    const s = service(b.service);
    const past = bookingDate(b) < new Date();
    const actions = [];
    if (b.status === 'confirmé' && !past) actions.push(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', on: { click: () => icsFor(b) } }, 'Agenda (.ics)'));
    if (canCancel(b)) actions.push(h('button', { type: 'button', class: 'btn btn-danger btn-sm', on: { click: () => cancel(b) } }, 'Annuler'));
    else if (b.status === 'confirmé' && !past) actions.push(h('p', { class: 'hint' }, 'Moins de 2 h avant : appelez le salon au 04 65 71 23 48.'));
    return h('li', { class: ['rdv', `st-${b.status === 'confirmé' && past ? 'terminé' : b.status}`] },
      h('div', { class: 'rdv-when' },
        h('span', { class: 'rdv-day' }, fmtDay(b.date, { weekday: 'short', day: 'numeric', month: 'short' })),
        h('span', { class: 'rdv-time' }, hhmm(b.start))),
      h('div', { class: 'rdv-what' },
        h('p', { class: 'rdv-title' }, `${s.name} avec ${barber(b.barber).name}`),
        h('p', { class: 'hint' }, `Code ${b.code} · ${euro0.format(s.price)} · `, h('span', { class: 'chip' }, STATUS_LABEL[b.status]))),
      actions.length ? h('div', { class: 'rdv-actions' }, actions) : null);
  }

  async function cancel(b) {
    const yes = await confirmDialog({
      title: 'Annuler ce rendez-vous ?',
      body: `${service(b.service).name}, ${fmtDay(b.date)} à ${hhmm(b.start)}. Le créneau sera libéré pour un autre client.`,
      ok: 'Oui, annuler', cancel: 'Garder', danger: true,
    });
    if (!yes) return;
    store.update((s) => { const x = s.bookings.find((y) => y.id === b.id); if (x && canCancel(x)) x.status = 'annulé'; });
    toast('Rendez-vous annulé. Le créneau est de nouveau libre.');
  }

  function draw() {
    const state = store.get();
    const mine = mineIds().map((id) => state.bookings.find((b) => b.id === id)).filter(Boolean)
      .sort((a, b) => bookingDate(b) - bookingDate(a));
    const lookup = h('form', { class: 'form card lookup', novalidate: true },
      h('h2', null, 'Retrouver un rendez-vous'),
      h('p', { class: 'hint' }, 'Pris depuis un autre appareil ? Saisissez le code reçu et votre numéro.'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'l-code' }, 'Code'), h('input', { id: 'l-code', name: 'code', placeholder: 'MC-XXXXX', maxlength: '12', autocomplete: 'off', required: true })),
        h('div', { class: 'field' }, h('label', { for: 'l-phone' }, 'Téléphone'), h('input', { id: 'l-phone', name: 'phone', type: 'tel', inputmode: 'tel', maxlength: '20', required: true }))),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Rechercher'));
    lookup.addEventListener('submit', (e) => {
      e.preventDefault();
      const wait = lockedFor();
      if (wait) { fieldError(lookup.code, `Trop d'essais. Réessayez dans ${wait} s.`); return; }
      const code = clean(lookup.code.value, 12).toUpperCase();
      const phone = normPhone(clean(lookup.phone.value, 20));
      const b = store.get().bookings.find((x) => x.code === code && x.phone === phone);
      // same message whether the code or the phone is wrong: no hint for guessing
      if (!b) { failed(); fieldError(lookup.code, 'Aucun rendez-vous ne correspond à ce code et ce numéro.'); return; }
      fieldError(lookup.code, '');
      rememberMine(b.id);
      found = b.id;
      draw();
    });

    mount(root, h('div', { class: 'wrap narrow' },
      h('a', { class: 'back-link', href: '#top' }, '← Retour au site'),
      h('h1', { tabindex: '-1' }, 'Mes rendez-vous'),
      mine.length
        ? h('ul', { class: 'rdv-list' }, mine.map(card))
        : h('div', { class: 'card empty' }, h('p', null, 'Aucun rendez-vous enregistré sur cet appareil.'), h('a', { class: 'btn btn-primary', href: '#/reserver' }, 'Réserver un créneau')),
      lookup,
      found ? h('p', { class: 'hint' }, 'Rendez-vous retrouvé et ajouté à la liste ci-dessus.') : null));
  }

  draw();
  return store.subscribe(draw);
}
