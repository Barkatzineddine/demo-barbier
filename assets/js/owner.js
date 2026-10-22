// Owner area: agenda per barber, bookings list + CSV, contact inbox, exceptional closures.
import { h, mount, clean, valid, normPhone, fieldError, toast, confirmDialog, uid, sha256, euro0, hhmm, fmtDay, isoDate, addDays, parseDate, download, csv } from './core.js';
import { SERVICES, BARBERS, DEMO_PIN, service, barber, dayInfo, freeSlots, isSlotFree, holiday, bookingDate } from './data.js';

const SESSION_KEY = 'corbin:owner-session';
const FAIL_KEY = 'corbin:owner-fails';
const STATUS = { 'confirmé': 'Confirmé', 'terminé': 'Terminé', absent: 'Absent', 'annulé': 'Annulé' };
const TABS = [['agenda', 'Agenda'], ['list', 'Réservations'], ['messages', 'Messages'], ['closures', 'Fermetures']];

const session = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } },
  set: (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked */ } },
};

export function render(root, store) {
  const narrow = window.matchMedia('(max-width: 859px)').matches;
  const ui = { tab: 'agenda', day: isoDate(new Date()), q: '', who: '', status: '', period: 'upcoming', agendaWho: narrow ? 'auto' : '' };

  // ---------- Login (demo PIN, hashed comparison, lockout after 5 errors) ----------
  function login() {
    const form = h('form', { class: 'form card login', novalidate: true },
      h('div', { class: 'field' },
        h('label', { for: 'pin' }, 'Code gérant'),
        h('input', { id: 'pin', name: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', required: true })),
      h('p', { class: 'hint' }, 'Code de démonstration : ', h('strong', null, DEMO_PIN)),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Entrer'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let fails = [];
      try { fails = JSON.parse(sessionStorage.getItem(FAIL_KEY)) || []; } catch { /* ignore */ }
      fails = fails.filter((t) => Date.now() - t < 30e3);
      if (fails.length >= 5) { fieldError(form.pin, 'Trop d’essais. Patientez 30 secondes.'); return; }
      const ok = (await sha256(form.pin.value)) === (await sha256(DEMO_PIN));
      if (!ok) {
        try { sessionStorage.setItem(FAIL_KEY, JSON.stringify([...fails, Date.now()])); } catch { /* ignore */ }
        fieldError(form.pin, 'Code incorrect.');
        form.pin.select();
        return;
      }
      session.set(true);
      draw();
    });
    mount(root, h('div', { class: 'wrap narrow' },
      h('a', { class: 'back-link', href: '#top' }, '← Retour au site'),
      h('h1', { tabindex: '-1' }, 'Espace gérant'),
      h('p', null, 'Agenda de l’équipe, réservations, messages du formulaire de contact et fermetures exceptionnelles.'),
      form,
      h('p', { class: 'hint' }, 'Démo : le code protège l’accès dans ce navigateur. En production, cet espace passe par une authentification côté serveur (mots de passe hachés, double authentification, sessions expirantes).')));
    form.pin.focus();
  }

  // ---------- Dashboard ----------
  function kpis(state) {
    const today = isoDate(new Date());
    const live = state.bookings.filter((b) => b.status !== 'annulé');
    const todayList = live.filter((b) => b.date === today);
    const left = todayList.filter((b) => b.status === 'confirmé' && bookingDate(b) > new Date()).length;
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const weekBookings = live.filter((b) => week.includes(b.date) && b.status === 'confirmé');
    const revenue = weekBookings.reduce((sum, b) => sum + service(b.service).price, 0);
    let capacity = 0, booked = 0;
    for (const d of week) {
      const info = dayInfo(state, d);
      if (!info.open) continue;
      for (const b of BARBERS) {
        if (!b.days.includes(parseDate(d).getDay())) continue;
        capacity += info.to - info.from - (b.pause ? b.pause[1] - b.pause[0] : 0);
        booked += live.filter((x) => x.date === d && x.barber === b.id).reduce((m, x) => m + service(x.service).min, 0);
      }
    }
    const unread = state.messages.filter((m) => !m.read).length;
    const tile = (label, value, sub) => h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, label), h('p', { class: 'kpi-value' }, value), h('p', { class: 'kpi-sub' }, sub));
    return h('div', { class: 'kpis' },
      tile('Aujourd’hui', String(todayList.length), `${left} à venir`),
      tile('CA prévu · 7 jours', euro0.format(revenue), `${weekBookings.length} rendez-vous`),
      tile('Remplissage · 7 jours', `${capacity ? Math.round((booked / capacity) * 100) : 0} %`, 'du temps des barbiers'),
      tile('Messages', String(unread), unread ? 'non lus' : 'tout est lu'));
  }

  function chart(state) {
    const today = isoDate(new Date());
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    const counts = days.map((d) => state.bookings.filter((b) => b.date === d && b.status !== 'annulé').length);
    const max = Math.max(4, ...counts);
    // HTML bars: heights set through CSSOM (allowed by the CSP, unlike style attributes)
    const cols = days.map((d, i) => {
      const bar = h('span', { class: ['bar', i === 0 && 'today', !dayInfo(state, d).open && 'off'] });
      bar.style.height = `${Math.max((counts[i] / max) * 100, 2)}%`;
      return h('li', { class: 'bar-col' },
        h('span', { class: 'bar-val' }, counts[i] ? String(counts[i]) : ''),
        h('span', { class: 'bar-track' }, bar),
        h('span', { class: 'bar-lab' }, fmtDay(d, { weekday: 'narrow' }) + parseDate(d).getDate()));
    });
    return h('figure', { class: 'card chart' },
      h('figcaption', null, 'Rendez-vous sur les 14 prochains jours'),
      h('ol', { class: 'bars', 'aria-label': days.map((d, i) => `${fmtDay(d, { weekday: 'long', day: 'numeric' })} : ${counts[i]}`).join(', ') }, cols));
  }

  function tabs(state) {
    const unread = state.messages.filter((m) => !m.read).length;
    const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' }, TABS.map(([id, label]) =>
      h('button', {
        type: 'button', role: 'tab', id: `tab-${id}`, 'aria-selected': String(ui.tab === id), 'aria-controls': 'panel', tabindex: ui.tab === id ? '0' : '-1',
        on: { click: () => { ui.tab = id; draw(); root.querySelector(`#tab-${id}`).focus(); } },
      }, label, id === 'messages' && unread ? h('span', { class: 'badge' }, String(unread)) : null)));
    list.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const i = TABS.findIndex(([id]) => id === ui.tab);
      ui.tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      draw();
      root.querySelector(`#tab-${ui.tab}`).focus();
    });
    return list;
  }

  function setStatus(id, status) {
    store.update((st) => { const b = st.bookings.find((x) => x.id === id); if (b) b.status = status; });
    toast(`Rendez-vous marqué « ${STATUS[status].toLowerCase()} ».`);
  }

  // ---------- Agenda ----------
  function agenda(state) {
    const info = dayInfo(state, ui.day);
    const weekday = parseDate(ui.day).getDay();
    const nav = h('div', { class: 'day-nav' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Jour précédent', on: { click: () => { ui.day = addDays(ui.day, -1); draw(); } } }, '←'),
      h('label', { class: 'sr', for: 'agenda-day' }, 'Jour affiché'),
      h('input', { id: 'agenda-day', type: 'date', value: ui.day, on: { change: (e) => { if (e.target.value) { ui.day = e.target.value; draw(); } } } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Jour suivant', on: { click: () => { ui.day = addDays(ui.day, 1); draw(); } } }, '→'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', on: { click: () => { ui.day = isoDate(new Date()); draw(); } } }, 'Aujourd’hui'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: !info.open, on: { click: () => addDialog() } }, '+ Rendez-vous'));
    const head = h('h2', { class: 'agenda-title' }, fmtDay(ui.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    if (!info.open) return [nav, head, h('p', { class: 'card empty' }, `Salon fermé : ${info.reason}.`)];

    const working = BARBERS.filter((b) => b.days.includes(weekday));
    if (ui.agendaWho === 'auto' || (ui.agendaWho && !working.some((b) => b.id === ui.agendaWho))) ui.agendaWho = narrow ? working[0]?.id || '' : '';
    const pick = h('div', { class: 'seg', role: 'group', 'aria-label': 'Barbier affiché' },
      [['', 'Tous'], ...working.map((b) => [b.id, b.name])].map(([id, label]) => h('button', {
        type: 'button', class: 'seg-btn', 'aria-pressed': String(ui.agendaWho === id),
        on: { click: () => { ui.agendaWho = id; draw(); } },
      }, label)));
    const cols = working.filter((b) => !ui.agendaWho || b.id === ui.agendaWho).map((b) => {
      const items = state.bookings.filter((x) => x.date === ui.day && x.barber === b.id).sort((a, c) => a.start - c.start);
      const live = items.filter((x) => x.status !== 'annulé');
      const blocks = [...live.map((x) => [x.start, x.start + service(x.service).min]), b.pause].sort((a, c) => a[0] - c[0]);
      const gaps = [];
      let t = info.from;
      for (const [a, c] of blocks) { if (a - t >= 15) gaps.push([t, a]); t = Math.max(t, c); }
      if (info.to - t >= 15) gaps.push([t, info.to]);
      const rows = [
        ...items.map((x) => ({ at: x.start, el: bookingCard(x) })),
        { at: b.pause[0], el: h('li', { class: 'slot-row pause' }, `${hhmm(b.pause[0])}–${hhmm(b.pause[1])} · Pause`) },
        ...gaps.map(([a, c]) => ({ at: a, el: h('li', { class: 'slot-row free' }, `${hhmm(a)}–${hhmm(c)} · Libre`) })),
      ].sort((a, c) => a.at - c.at);
      return h('section', { class: 'agenda-col', 'aria-label': `Agenda de ${b.name}` },
        h('h3', null, b.name, h('span', { class: 'hint' }, ` · ${live.length} rdv`)),
        h('ul', { class: 'agenda-list' }, rows.map((r) => r.el)));
    });
    return [nav, head, pick, h('div', { class: ['agenda', ui.agendaWho && 'single'] }, cols)];
  }

  function bookingCard(x) {
    const sv = service(x.service);
    const started = bookingDate(x).getTime() <= Date.now() + 15 * 60e3;
    const actions = {
      'confirmé': started ? [['terminé', 'Terminé'], ['absent', 'Absent'], ['annulé', 'Annuler']] : [['annulé', 'Annuler']],
      'terminé': [['absent', 'Marquer absent']],
      absent: [['terminé', 'Marquer terminé']],
      'annulé': started ? [] : [['confirmé', 'Rétablir']],
    }[x.status];
    return h('li', { class: ['slot-row', 'booked', `st-${x.status}`] },
      h('div', { class: 'sr-top' },
        h('strong', null, `${hhmm(x.start)}–${hhmm(x.start + sv.min)}`),
        h('span', { class: 'chip' }, STATUS[x.status])),
      h('p', null, h('strong', null, x.name), ` · ${sv.name}`),
      h('p', { class: 'hint' }, h('a', { href: `tel:${x.phone.replace(/\s/g, '')}` }, x.phone), ` · ${x.source} · ${x.code}`),
      x.note ? h('p', { class: 'note-text' }, `« ${x.note} »`) : null,
      h('div', { class: 'row-actions' }, actions.map(([st, label]) => h('button', {
        type: 'button', class: ['btn', 'btn-xs', st === 'annulé' ? 'btn-danger' : 'btn-ghost'],
        on: { click: async () => {
          if (st === 'annulé' && !(await confirmDialog({ title: 'Annuler ce rendez-vous ?', body: `${x.name}, ${sv.name} à ${hhmm(x.start)}.`, ok: 'Annuler le rdv', cancel: 'Garder', danger: true }))) return;
          if (st === 'confirmé' && !isSlotFree(store.get(), x, x.id)) { toast('Le créneau a été repris entre-temps.', 'err'); return; }
          setStatus(x.id, st);
        } },
      }, label, h('span', { class: 'sr' }, ` : ${x.name} à ${hhmm(x.start)}`)))));
  }

  function addDialog() {
    const form = h('form', { method: 'dialog', class: 'form', novalidate: true });
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'add-title' }, form);
    const svc = h('select', { id: 'a-svc', name: 'svc' }, SERVICES.map((x) => h('option', { value: x.id }, `${x.name} (${x.min} min)`)));
    const who = h('select', { id: 'a-who', name: 'who' }, BARBERS.filter((b) => b.days.includes(parseDate(ui.day).getDay())).map((b) => h('option', { value: b.id }, b.name)));
    const time = h('select', { id: 'a-time', name: 'time' });
    const fill = () => {
      const slots = freeSlots(store.get(), ui.day, svc.value, who.value);
      mount(time, slots.length ? slots.map((x) => h('option', { value: String(x.start) }, hhmm(x.start))) : h('option', { value: '' }, 'Aucun créneau libre'));
    };
    svc.addEventListener('change', fill);
    who.addEventListener('change', fill);
    fill();
    mount(form,
      h('h2', { id: 'add-title' }, `Nouveau rendez-vous · ${fmtDay(ui.day)}`),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'a-svc' }, 'Prestation'), svc),
        h('div', { class: 'field' }, h('label', { for: 'a-who' }, 'Barbier'), who)),
      h('div', { class: 'field' }, h('label', { for: 'a-time' }, 'Heure'), time),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'a-name' }, 'Client'), h('input', { id: 'a-name', name: 'cname', maxlength: '60', required: true })),
        h('div', { class: 'field' }, h('label', { for: 'a-phone' }, 'Téléphone'), h('input', { id: 'a-phone', name: 'phone', type: 'tel', maxlength: '20', required: true }))),
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => dlg.close() } }, 'Fermer'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Ajouter')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = clean(form.cname.value, 60);
      const phone = clean(form.phone.value, 20);
      let ok = fieldError(form.cname, valid.name(name) ? '' : 'Nom du client requis.');
      ok = fieldError(form.phone, valid.phone(phone) ? '' : 'Numéro invalide.') && ok;
      ok = fieldError(time, time.value ? '' : 'Choisissez une heure.') && ok;
      if (!ok) return;
      const b = { id: uid('b'), code: uid('MC-', 5), service: svc.value, barber: who.value, date: ui.day, start: Number(time.value),
        status: 'confirmé', name, phone: normPhone(phone), email: '', note: '', source: 'téléphone', created: new Date().toISOString() };
      if (!isSlotFree(store.get(), b)) { toast('Créneau déjà pris.', 'err'); fill(); return; }
      store.update((st) => st.bookings.push(b));
      dlg.close();
      toast(`Rendez-vous ajouté : ${name} à ${hhmm(b.start)}.`);
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // ---------- Bookings list ----------
  function filtered(state) {
    const now = new Date();
    const q = ui.q.toLowerCase();
    return state.bookings.filter((b) => {
      const when = bookingDate(b);
      if (ui.period === 'upcoming' && when < now) return false;
      if (ui.period === 'past' && when >= now) return false;
      if (ui.who && b.barber !== ui.who) return false;
      if (ui.status && b.status !== ui.status) return false;
      return !q || `${b.name} ${b.code} ${b.phone}`.toLowerCase().includes(q);
    }).sort((a, b) => (ui.period === 'past' ? bookingDate(b) - bookingDate(a) : bookingDate(a) - bookingDate(b)));
  }

  function listView() {
    const sel = (id, label, value, options, key) => h('div', { class: 'field' }, h('label', { for: id }, label),
      h('select', { id, on: { change: (e) => { ui[key] = e.target.value; draw(); } } },
        options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
    const search = h('input', { id: 'f-q', type: 'search', value: ui.q, placeholder: 'Nom, code, téléphone', maxlength: '40' });
    search.addEventListener('input', () => { ui.q = clean(search.value, 40); drawList(); });
    const filters = h('div', { class: 'filters' },
      h('div', { class: 'field' }, h('label', { for: 'f-q' }, 'Rechercher'), search),
      sel('f-period', 'Période', ui.period, [['upcoming', 'À venir'], ['past', 'Passés'], ['all', 'Tous']], 'period'),
      sel('f-who', 'Barbier', ui.who, [['', 'Tous'], ...BARBERS.map((b) => [b.id, b.name])], 'who'),
      sel('f-status', 'Statut', ui.status, [['', 'Tous'], ...Object.entries(STATUS)], 'status'),
      h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => exportCsv(filtered(store.get())) } }, 'Exporter en CSV'));
    const tableWrap = h('div', { id: 'list-wrap' });
    function drawList() {
      const list = filtered(store.get());
      mount(tableWrap,
        h('p', { class: 'hint', 'aria-live': 'polite' }, `${list.length} rendez-vous${list.length > 100 ? ' (100 premiers affichés)' : ''}`),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Date', 'Heure', 'Client', 'Prestation', 'Barbier', 'Statut', 'Source'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, list.slice(0, 100).map((b) => h('tr', { class: `st-${b.status}` },
            h('td', null, fmtDay(b.date, { weekday: 'short', day: 'numeric', month: 'short' })),
            h('td', null, hhmm(b.start)),
            h('td', null, b.name, h('br'), h('span', { class: 'hint' }, `${b.phone} · ${b.code}`)),
            h('td', null, service(b.service).name),
            h('td', null, barber(b.barber).name),
            h('td', null, h('span', { class: 'chip' }, STATUS[b.status])),
            h('td', null, b.source)))))));
    }
    drawList();
    return [filters, tableWrap];
  }

  function exportCsv(list) {
    const rows = [['Date', 'Heure', 'Client', 'Téléphone', 'E-mail', 'Prestation', 'Prix', 'Barbier', 'Statut', 'Source', 'Code', 'Remarque'],
      ...list.map((b) => [b.date, hhmm(b.start), b.name, b.phone, b.email, service(b.service).name, service(b.service).price, barber(b.barber).name, STATUS[b.status], b.source, b.code, b.note])];
    download(`reservations-${isoDate(new Date())}.csv`, csv(rows), 'text/csv;charset=utf-8');
    toast(`${list.length} lignes exportées.`);
  }

  // ---------- Messages ----------
  function messages(state) {
    if (!state.messages.length) return h('p', { class: 'card empty' }, 'Aucun message. Testez le formulaire de contact en bas de la page d’accueil.');
    return h('ul', { class: 'msg-list' }, state.messages.map((m) => h('li', { class: ['card', 'msg', !m.read && 'unread'] },
      h('div', { class: 'msg-head' },
        h('p', null, h('strong', null, m.name), ' · ', h('a', { href: `mailto:${m.email}` }, m.email)),
        h('p', { class: 'hint' }, `${m.subject} · ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.at))}`)),
      h('p', { class: 'msg-body' }, m.message),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-xs', on: { click: () => store.update((st) => { const x = st.messages.find((y) => y.id === m.id); if (x) x.read = !x.read; }) } }, m.read ? 'Marquer non lu' : 'Marquer comme lu'),
        h('button', { type: 'button', class: 'btn btn-danger btn-xs', on: { click: async () => {
          if (await confirmDialog({ title: 'Supprimer ce message ?', body: `Message de ${m.name}.`, ok: 'Supprimer', danger: true })) {
            store.update((st) => { st.messages = st.messages.filter((y) => y.id !== m.id); });
            toast('Message supprimé.');
          }
        } } }, 'Supprimer')))));
  }

  // ---------- Closures ----------
  function closures(state) {
    const today = isoDate(new Date());
    const form = h('form', { class: 'form card', novalidate: true },
      h('h2', null, 'Ajouter une fermeture'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'cl-date' }, 'Date'), h('input', { id: 'cl-date', name: 'date', type: 'date', min: today, required: true })),
        h('div', { class: 'field' }, h('label', { for: 'cl-reason' }, 'Motif affiché'), h('input', { id: 'cl-reason', name: 'reason', maxlength: '80', placeholder: 'Congés, formation…' }))),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Fermer ce jour'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = form.date.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) { fieldError(form.date, 'Choisissez une date à venir.'); return; }
      if (store.get().closures.some((c) => c.date === date)) { fieldError(form.date, 'Ce jour est déjà fermé.'); return; }
      fieldError(form.date, '');
      const affected = store.get().bookings.filter((b) => b.date === date && b.status === 'confirmé');
      if (affected.length && !(await confirmDialog({
        title: `${affected.length} rendez-vous ce jour-là`,
        body: `${affected.map((b) => `${hhmm(b.start)} ${b.name}`).join(', ')}. Ils restent dans l’agenda : pensez à prévenir ces clients.`,
        ok: 'Fermer quand même',
      }))) return;
      store.update((st) => st.closures.push({ date, reason: clean(form.reason.value, 80) || 'Fermeture exceptionnelle' }));
      toast(`Le ${fmtDay(date)} n’est plus réservable en ligne.`);
    });
    const upcoming = state.closures.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const holidays = [];
    for (let i = 0; i < 400 && holidays.length < 4; i++) { const d = addDays(today, i); const n = holiday(d); if (n) holidays.push([d, n]); }
    return [form,
      h('h2', { class: 'sub-title' }, 'Fermetures à venir'),
      upcoming.length ? h('ul', { class: 'plain-list' }, upcoming.map((c) => h('li', { class: 'card row-between' },
        h('span', null, h('strong', null, fmtDay(c.date)), ` · ${c.reason}`),
        h('button', { type: 'button', class: 'btn btn-ghost btn-xs', on: { click: () => { store.update((st) => { st.closures = st.closures.filter((x) => x.date !== c.date); }); toast('Jour rouvert à la réservation.'); } } }, 'Rouvrir')))) : h('p', { class: 'hint' }, 'Aucune.'),
      h('h2', { class: 'sub-title' }, 'Jours fériés (fermés automatiquement)'),
      h('ul', { class: 'plain-list hint' }, holidays.map(([d, n]) => h('li', null, `${fmtDay(d)} · ${n}`)))];
  }

  function draw() {
    if (!session.get()) { login(); return; }
    const state = store.get();
    const focusId = document.activeElement?.id;
    const panel = { agenda, list: listView, messages, closures }[ui.tab](state);
    mount(root, h('div', { class: 'wrap owner' },
      h('div', { class: 'owner-head' },
        h('div', null, h('a', { class: 'back-link', href: '#top' }, '← Site public'), h('h1', { tabindex: '-1' }, 'Espace gérant')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', on: { click: () => { session.set(false); draw(); } } }, 'Se déconnecter')),
      kpis(state),
      chart(state),
      tabs(state),
      h('div', { id: 'panel', role: 'tabpanel', 'aria-labelledby': `tab-${ui.tab}`, class: 'panel' }, panel)));
    if (focusId) document.getElementById(focusId)?.focus();
  }

  draw();
  return store.subscribe(() => draw());
}
