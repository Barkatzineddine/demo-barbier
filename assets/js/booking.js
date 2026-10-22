// Booking flow: service -> barber -> day & slot -> details -> confirmation.
import { h, mount, clean, valid, fieldError, guard, honeypot, toast, uid, euro0, hhmm, fmtDay, isoDate, addDays, normPhone } from './core.js';
import { SERVICES, BARBERS, service, barber, freeSlots, dayInfo, isSlotFree, BOOKING_WINDOW_DAYS, weekdayShort } from './data.js';
import { icsFor, rememberMine, mineIds } from './shared.js';

const STEPS = ['Prestation', 'Barbier', 'Date & heure', 'Coordonnées'];
const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`);

export function render(root, store, params) {
  const sel = { step: 0, service: null, barber: undefined, date: null, slot: null, done: null };
  if (service(params.get('s'))) { sel.service = params.get('s'); sel.step = 1; }
  let formGuard = null;

  const go = (step) => { sel.step = step; draw(); root.querySelector('.step-title')?.focus(); };

  function draw() {
    mount(root, h('div', { class: 'wrap booking' },
      h('a', { class: 'back-link', href: '#top' }, '← Retour au site'),
      h('h1', { tabindex: '-1' }, sel.done ? 'Rendez-vous confirmé' : 'Réserver un créneau'),
      sel.done ? null : stepper(),
      sel.done ? confirmation() : h('div', { class: 'booking-grid' },
        h('div', { class: 'booking-main' }, [stepService, stepBarber, stepSlot, stepDetails][sel.step]()),
        summary())));
  }

  function stepper() {
    return h('ol', { class: 'stepper' }, STEPS.map((label, i) =>
      h('li', { class: [i < sel.step && 'done', i === sel.step && 'current'], 'aria-current': i === sel.step ? 'step' : null },
        h('span', { class: 'n', 'aria-hidden': 'true' }, i < sel.step ? '✓' : String(i + 1)),
        h('span', { class: 'l' }, label))));
  }

  function choice({ title, meta, aside, pressed, onPick, disabled }) {
    return h('button', { type: 'button', class: 'choice', 'aria-pressed': String(Boolean(pressed)), disabled, on: { click: onPick } },
      h('span', { class: 'c-title' }, title),
      meta ? h('span', { class: 'c-meta' }, meta) : null,
      aside ? h('span', { class: 'c-aside' }, aside) : null);
  }

  function stepService() {
    return h('section', { 'aria-labelledby': 'st' },
      h('h2', { id: 'st', class: 'step-title', tabindex: '-1' }, '1. Choisissez une prestation'),
      h('div', { class: 'choices' }, SERVICES.map((s) => choice({
        title: s.name, meta: dur(s.min), aside: euro0.format(s.price), pressed: sel.service === s.id,
        onPick: () => { sel.service = s.id; sel.slot = null; go(1); },
      }))));
  }

  function stepBarber() {
    return h('section', { 'aria-labelledby': 'st' },
      h('h2', { id: 'st', class: 'step-title', tabindex: '-1' }, '2. Avec qui ?'),
      h('div', { class: 'choices' },
        choice({ title: 'Sans préférence', meta: 'Le premier barbier disponible : plus de créneaux', pressed: sel.barber === null,
          onPick: () => { sel.barber = null; sel.slot = null; go(2); } }),
        BARBERS.map((b) => choice({
          title: b.name, meta: `${b.role} · ${b.days.map(weekdayShort).join(', ')}`, pressed: sel.barber === b.id,
          onPick: () => { sel.barber = b.id; sel.slot = null; go(2); },
        }))),
      backBtn(0));
  }

  function stepSlot() {
    const state = store.get();
    const today = isoDate(new Date());
    const days = Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDays(today, i)).map((iso) => {
      const info = dayInfo(state, iso);
      const slots = info.open ? freeSlots(state, iso, sel.service, sel.barber) : [];
      return { iso, info, slots };
    });
    if (!sel.date || !days.some((d) => d.iso === sel.date)) sel.date = (days.find((d) => d.slots.length) || days[0]).iso;
    const day = days.find((d) => d.iso === sel.date);
    const groups = [['Matin', 0, 720], ['Après-midi', 720, 1020], ['Soir', 1020, 1440]]
      .map(([label, a, b]) => [label, day.slots.filter((s) => s.start >= a && s.start < b)])
      .filter(([, list]) => list.length);
    const nextFree = days.find((d) => d.iso > sel.date && d.slots.length);

    const strip = h('div', { class: 'days', role: 'group', 'aria-label': 'Jours disponibles' }, days.map((d) => {
      const label = fmtDay(d.iso, { weekday: 'short', day: 'numeric', month: 'short' });
      const sub = !d.info.open ? (d.info.reason.startsWith('Férié') ? 'Férié' : 'Fermé') : d.slots.length ? `${d.slots.length} dispo` : 'Complet';
      return h('button', {
        type: 'button', class: ['day', d.iso === sel.date && 'on'], 'aria-pressed': String(d.iso === sel.date),
        disabled: !d.slots.length, 'aria-label': `${fmtDay(d.iso)} : ${sub}`,
        on: { click: () => { sel.date = d.iso; draw(); root.querySelector('.day.on')?.focus(); } },
      }, h('span', { class: 'd1' }, label), h('span', { class: 'd2' }, sub));
    }));
    requestAnimationFrame(() => root.querySelector('.day.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));

    return h('section', { 'aria-labelledby': 'st' },
      h('h2', { id: 'st', class: 'step-title', tabindex: '-1' }, '3. Choisissez un jour et une heure'),
      strip,
      h('h3', { class: 'day-title' }, fmtDay(sel.date)),
      groups.length ? groups.map(([label, list]) => h('div', { class: 'slot-group' },
        h('p', { class: 'slot-label' }, label),
        h('div', { class: 'slots' }, list.map((s) => h('button', {
          type: 'button', class: 'slot', 'aria-label': `${hhmm(s.start)}${sel.barber ? '' : ` avec ${barber(s.barber).name}`}`,
          on: { click: () => { sel.slot = s; go(3); } },
        }, hhmm(s.start)))))) : h('p', { class: 'empty' }, 'Plus aucun créneau ce jour-là. ',
        nextFree ? h('button', { type: 'button', class: 'linklike', on: { click: () => { sel.date = nextFree.iso; draw(); } } }, `Prochain jour disponible : ${fmtDay(nextFree.iso)}`) : null),
      backBtn(1));
  }

  function stepDetails() {
    const form = h('form', { class: 'form card', novalidate: true },
      h('h2', { id: 'st', class: 'step-title', tabindex: '-1' }, '4. Vos coordonnées'),
      field('b-name', 'Nom et prénom', h('input', { id: 'b-name', name: 'name', autocomplete: 'name', maxlength: '60', required: true })),
      field('b-phone', 'Téléphone mobile', h('input', { id: 'b-phone', name: 'phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '20', required: true }), 'Pour le rappel la veille (désactivé dans la démo).'),
      field('b-email', 'E-mail (facultatif)', h('input', { id: 'b-email', name: 'email', type: 'email', autocomplete: 'email', maxlength: '254' })),
      field('b-note', 'Une précision ? (facultatif)', h('textarea', { id: 'b-note', name: 'note', rows: '3', maxlength: '300' })),
      h('div', { class: 'field check' },
        h('input', { id: 'b-consent', name: 'consent', type: 'checkbox', required: true }),
        h('label', { for: 'b-consent' }, "J'accepte que ces informations servent uniquement à gérer ce rendez-vous.")),
      honeypot('company'),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => go(2) } }, '← Changer de créneau'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Confirmer le rendez-vous')));
    formGuard = guard(form, { key: 'corbin:booking', max: 3, windowMs: 30 * 60e3, minMs: 2000 });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
    return form;
  }

  function field(id, label, input, hint) {
    return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
  }

  function submit(form) {
    const name = clean(form.name.value, 60);
    const phone = clean(form.phone.value, 20);
    const email = clean(form.email.value, 254).toLowerCase();
    const note = clean(form.note.value, 300, true);
    let ok = fieldError(form.name, valid.name(name) ? '' : 'Indiquez votre nom (lettres uniquement).');
    ok = fieldError(form.phone, valid.phone(phone) ? '' : 'Numéro français attendu, par exemple 06 12 34 56 78.') && ok;
    ok = fieldError(form.email, !email || valid.email(email) ? '' : 'Adresse e-mail invalide.') && ok;
    ok = fieldError(form.consent, form.consent.checked ? '' : 'Merci de cocher cette case.') && ok;
    if (!ok) { form.querySelector('[aria-invalid=true]')?.focus(); return; }

    const verdict = formGuard.check(note);
    if (verdict.silent) { sel.done = { code: uid('MC-', 5), fake: true }; draw(); return; }
    if (!verdict.ok) { toast(verdict.msg, 'err'); return; }

    const state = store.get();
    const p = normPhone(phone);
    const now = new Date();
    const upcoming = state.bookings.filter((b) => b.phone === p && b.status === 'confirmé' && b.date >= isoDate(now));
    if (upcoming.length >= 2) { toast('Ce numéro a déjà 2 rendez-vous à venir. Annulez-en un ou appelez le salon.', 'err'); return; }

    const booking = {
      id: uid('b'), code: uid('MC-', 5), service: sel.service, barber: sel.slot.barber, date: sel.date, start: sel.slot.start,
      status: 'confirmé', name, phone: p, email, note, source: 'en ligne', created: now.toISOString(),
    };
    if (!isSlotFree(state, booking)) { // someone took it meanwhile (another tab, the owner...)
      toast('Ce créneau vient d’être pris. Choisissez-en un autre.', 'err');
      sel.slot = null; go(2); return;
    }
    verdict.commit();
    store.update((s) => s.bookings.push(booking));
    rememberMine(booking.id);
    sel.done = booking;
    draw();
    root.querySelector('h1').focus();
  }

  function summary() {
    const s = service(sel.service);
    const who = sel.slot ? barber(sel.slot.barber).name : sel.barber ? barber(sel.barber).name : sel.barber === null ? 'Sans préférence' : null;
    const row = (label, value, step) => h('div', { class: 'sum-row' },
      h('dt', null, label),
      h('dd', null, value || '—', value && step < sel.step ? h('button', { type: 'button', class: 'linklike', on: { click: () => go(step) } }, 'Modifier', h('span', { class: 'sr' }, ` ${label.toLowerCase()}`)) : null));
    return h('aside', { class: 'summary card', 'aria-label': 'Récapitulatif' },
      h('h2', null, 'Récapitulatif'),
      h('dl', null,
        row('Prestation', s ? `${s.name} · ${dur(s.min)}` : null, 0),
        row('Barbier', who, 1),
        row('Date', sel.slot ? `${fmtDay(sel.date)} à ${hhmm(sel.slot.start)}` : null, 2)),
      h('p', { class: 'sum-total' }, h('span', null, 'À régler au salon'), h('strong', null, s ? euro0.format(s.price) : '—')),
      h('p', { class: 'hint' }, 'Annulation gratuite en ligne jusqu’à 2 h avant.'));
  }

  function confirmation() {
    const b = sel.done;
    if (b.fake) return h('div', { class: 'card confirm' }, h('p', null, 'Votre demande a été enregistrée.'));
    const s = service(b.service);
    const ics = h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => icsFor(b) } }, 'Ajouter à mon agenda (.ics)');
    return h('div', { class: 'card confirm' },
      h('div', { class: 'confirm-mark', 'aria-hidden': 'true' }, '✓'),
      h('p', { class: 'lead' }, `${s.name} avec ${barber(b.barber).name}, ${fmtDay(b.date)} à ${hhmm(b.start)}.`),
      h('p', null, 'Votre code de réservation : ', h('strong', { class: 'code' }, b.code)),
      h('p', { class: 'hint' }, `Gardez-le pour retrouver ou annuler ce rendez-vous. Durée ${dur(s.min)}, ${euro0.format(s.price)} à régler au salon.`),
      h('div', { class: 'form-actions' }, ics,
        h('a', { class: 'btn btn-ghost', href: '#/mes-rendez-vous' }, 'Mes rendez-vous'),
        h('a', { class: 'btn btn-ghost', href: '#/gerant' }, 'Voir côté gérant')),
      h('p', { class: 'hint' }, `Ce navigateur garde ${mineIds().length > 1 ? `vos ${mineIds().length} rendez-vous` : 'votre rendez-vous'} en mémoire. Dans un vrai déploiement, un SMS et un e-mail de confirmation partiraient ici.`));
  }

  function backBtn(step) {
    return h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => go(step) } }, '← Étape précédente'));
  }

  draw();
  // another tab booked or the owner changed something: refresh the slots
  return store.subscribe(() => { if (sel.step === 2 && !sel.done) draw(); });
}
