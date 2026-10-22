// Business data, seed generator and the slot engine.
import { isoDate, addDays, parseDate, uid } from './core.js';

export const STORE_KEY = 'corbin:v1';
export const DEMO_PIN = '2468';

export const SERVICES = [
  { id: 'coupe', name: 'Coupe homme', min: 30, price: 28 },
  { id: 'coupe-barbe', name: 'Coupe + barbe', min: 50, price: 42 },
  { id: 'degrade', name: 'Dégradé américain', min: 40, price: 32 },
  { id: 'barbe', name: 'Taille de barbe', min: 25, price: 20 },
  { id: 'rasage', name: "Rasage à l'ancienne", min: 40, price: 32 },
  { id: 'enfant', name: 'Coupe enfant', min: 25, price: 18 },
  { id: 'soin', name: 'Soin visage express', min: 20, price: 22 },
  { id: 'mariage', name: 'Forfait marié', min: 90, price: 85 },
];

// days: 0 = Sunday ... 6 = Saturday. pause = [start, end] in minutes.
export const BARBERS = [
  { id: 'karim', name: 'Karim', role: "Fondateur · rasage à l'ancienne", days: [2, 3, 4, 5, 6], pause: [780, 825] },
  { id: 'theo', name: 'Théo', role: 'Dégradés & coupes texturées', days: [3, 4, 5, 6], pause: [810, 855] },
  { id: 'ines', name: 'Inès', role: 'Ciseaux & barbes sculptées', days: [2, 4, 5, 6], pause: [765, 810] },
];

export const HOURS = { 0: null, 1: null, 2: [600, 1170], 3: [600, 1170], 4: [600, 1260], 5: [600, 1170], 6: [540, 1080] };
export const STEP = 15;
export const LEAD_MIN = 30; // no booking less than 30 min ahead
export const CANCEL_LIMIT_MIN = 120;
export const BOOKING_WINDOW_DAYS = 28;

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const weekdayShort = (n) => WEEKDAYS[n];

export const service = (id) => SERVICES.find((s) => s.id === id);
export const barber = (id) => BARBERS.find((b) => b.id === id);

// ---------- French public holidays ----------
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  return isoDate(new Date(year, month - 1, day));
}
const holidayCache = new Map();
export function holiday(iso) {
  const year = +iso.slice(0, 4);
  if (!holidayCache.has(year)) {
    const e = easter(year);
    holidayCache.set(year, new Map([
      [`${year}-01-01`, "Jour de l'an"], [addDays(e, 1), 'Lundi de Pâques'], [`${year}-05-01`, 'Fête du Travail'],
      [`${year}-05-08`, 'Victoire 1945'], [addDays(e, 39), 'Ascension'], [addDays(e, 50), 'Lundi de Pentecôte'],
      [`${year}-07-14`, 'Fête nationale'], [`${year}-08-15`, 'Assomption'], [`${year}-11-01`, 'Toussaint'],
      [`${year}-11-11`, 'Armistice'], [`${year}-12-25`, 'Noël'],
    ]));
  }
  return holidayCache.get(year).get(iso) || null;
}

/** Is the shop open that day, and when? */
export function dayInfo(state, iso) {
  const hours = HOURS[parseDate(iso).getDay()];
  if (!hours) return { open: false, reason: 'Fermé' };
  const h = holiday(iso);
  if (h) return { open: false, reason: `Férié · ${h}` };
  const closure = state.closures.find((c) => c.date === iso);
  if (closure) return { open: false, reason: closure.reason || 'Fermeture exceptionnelle' };
  return { open: true, from: hours[0], to: hours[1] };
}

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/** Busy intervals of one barber on a day (bookings + pause). */
function busy(state, barberId, iso, ignoreId) {
  const b = barber(barberId);
  const list = state.bookings
    .filter((x) => x.barber === barberId && x.date === iso && x.status !== 'annulé' && x.id !== ignoreId)
    .map((x) => [x.start, x.start + service(x.service).min]);
  if (b.pause) list.push(b.pause);
  return list;
}

/**
 * Free start times for a service on a day. barberId = null means "any barber":
 * each start is given to the free barber with the fewest bookings that day.
 */
export function freeSlots(state, iso, serviceId, barberId = null, now = new Date()) {
  const info = dayInfo(state, iso);
  if (!info.open) return [];
  const dur = service(serviceId).min;
  const weekday = parseDate(iso).getDay();
  const candidates = (barberId ? [barber(barberId)] : BARBERS).filter((b) => b.days.includes(weekday));
  const load = (id) => state.bookings.filter((x) => x.barber === id && x.date === iso && x.status !== 'annulé').length;
  candidates.sort((a, b) => load(a.id) - load(b.id));
  const busyBy = Object.fromEntries(candidates.map((b) => [b.id, busy(state, b.id, iso)]));
  const today = isoDate(now);
  const earliest = iso === today ? nowMinutes(now) + LEAD_MIN : 0;
  const out = [];
  for (let t = info.from; t + dur <= info.to; t += STEP) {
    if (t < earliest) continue;
    const who = candidates.find((b) => !busyBy[b.id].some(([s, e]) => overlaps(t, t + dur, s, e)));
    if (who) out.push({ start: t, barber: who.id });
  }
  return out;
}

export function isSlotFree(state, { date, start, service: sid, barber: bid }, ignoreId) {
  const info = dayInfo(state, date);
  if (!info.open) return false;
  const end = start + service(sid).min;
  if (start < info.from || end > info.to) return false;
  if (!barber(bid).days.includes(parseDate(date).getDay())) return false;
  return !busy(state, bid, date, ignoreId).some(([s, e]) => overlaps(start, end, s, e));
}

export function bookingDate(b) {
  const d = parseDate(b.date);
  d.setMinutes(b.start);
  return d;
}

// ---------- Validation of stored state (tampered or corrupt data is discarded) ----------
const str = (v, max) => typeof v === 'string' && v.length <= max;
const STATUSES = ['confirmé', 'terminé', 'absent', 'annulé'];
export function validState(d) {
  return d && d.v === 1 && Array.isArray(d.bookings) && Array.isArray(d.messages) && Array.isArray(d.closures)
    && d.bookings.length < 5000 && d.bookings.every((b) => str(b.id, 20) && str(b.code, 12) && service(b.service) && barber(b.barber)
      && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isInteger(b.start) && STATUSES.includes(b.status)
      && str(b.name, 60) && str(b.phone, 20) && str(b.email || '', 254) && str(b.note || '', 300))
    && d.messages.every((m) => str(m.id, 20) && str(m.name, 60) && str(m.email, 254) && str(m.subject, 60) && str(m.message, 1000))
    && d.closures.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && str(c.reason || '', 80));
}

// ---------- Seed: a believable, busy agenda around today ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Julien', 'Yanis', 'Antoine', 'Mehdi', 'Hugo', 'Thomas', 'Nicolas', 'Sofiane', 'Maxime', 'Lucas', 'Adrien', 'Bilal', 'Romain', 'Kévin', 'Paul', 'Enzo', 'Samir', 'Baptiste', 'Rayan', 'Clément', 'Florian', 'Malik', 'Quentin', 'Arthur', 'Nathan', 'Mathis', 'Jules', 'Ilyes', 'Victor', 'Louis'];
const LAST = 'BCDFGHJKLMNPRSTV';
const WEIGHTED = ['coupe', 'coupe', 'coupe', 'coupe-barbe', 'coupe-barbe', 'degrade', 'degrade', 'barbe', 'barbe', 'rasage', 'enfant', 'soin'];

export function seed(now = new Date()) {
  const today = isoDate(now);
  const r = rng(Number(today.replace(/-/g, '')));
  const state = { v: 1, bookings: [], messages: [], closures: [] };
  // an exceptional closure three weeks ahead, on an opening day
  for (let i = 18; i < 28; i++) {
    const d = addDays(today, i);
    if (dayInfo(state, d).open) { state.closures.push({ date: d, reason: 'Formation de l’équipe' }); break; }
  }
  for (let i = -10; i <= 16; i++) {
    const date = addDays(today, i);
    const info = dayInfo(state, date);
    if (!info.open) continue;
    const fill = i < 0 ? 0.75 : i < 3 ? 0.7 : i < 8 ? 0.5 : 0.28; // fuller in the next days
    for (const b of BARBERS) {
      if (!b.days.includes(parseDate(date).getDay())) continue;
      let t = info.from;
      while (t < info.to) {
        const sid = WEIGHTED[Math.floor(r() * WEIGHTED.length)];
        const dur = service(sid).min;
        if (r() < fill && isSlotFree(state, { date, start: t, service: sid, barber: b.id })) {
          const past = i < 0 || (i === 0 && t + dur < nowMinutes(now));
          const status = past ? (r() < 0.06 ? 'absent' : 'terminé') : (r() < 0.05 ? 'annulé' : 'confirmé');
          const first = FIRST[Math.floor(r() * FIRST.length)];
          state.bookings.push({
            id: uid('b'), code: uid('MC-', 5), service: sid, barber: b.id, date, start: t, status,
            name: `${first} ${LAST[Math.floor(r() * LAST.length)]}.`,
            phone: `06 39 98 ${String(Math.floor(r() * 90) + 10)} ${String(Math.floor(r() * 90) + 10)}`,
            email: '', note: '', source: r() < 0.7 ? 'en ligne' : 'téléphone',
            created: new Date(now.getTime() - (20 - i) * 864e5 * r()).toISOString(),
          });
          t += dur;
        } else {
          t += STEP * (1 + Math.floor(r() * 2));
        }
      }
    }
  }
  state.messages.push(
    { id: uid('m'), name: 'Camille Roux', email: 'camille.roux@example.com', subject: 'Mariage ou groupe', read: false,
      message: "Bonjour, mon frère se marie le samedi 14 novembre. Serait-il possible de privatiser le salon de 8 h à 10 h pour lui et quatre témoins (coupe + barbe) ? Merci !",
      at: new Date(now.getTime() - 3 * 36e5).toISOString() },
    { id: uid('m'), name: 'Jérôme Martin', email: 'j.martin@example.com', subject: 'Carte cadeau', read: true,
      message: 'Bonjour, proposez-vous des cartes cadeaux pour un rasage à l’ancienne ? Je voudrais en offrir une pour Noël.',
      at: new Date(now.getTime() - 2 * 864e5).toISOString() },
  );
  return state;
}
