// Deterministic demo data built around today, so the agenda always looks like a busy shop.
import { BARBERS, STEP, service, type ServiceId } from './catalog';
import { addDays, isoDate, minutesOf, weekday } from './dates';
import type { State } from './schema';
import { checkPlacement, dayInfo } from './slots';

/** Small seeded PRNG (mulberry32): same day, same data. */
export function rng(seed: number): () => number {
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
const WEIGHTED: ServiceId[] = ['coupe', 'coupe', 'coupe', 'coupe-barbe', 'coupe-barbe', 'degrade', 'degrade', 'barbe', 'barbe', 'rasage', 'enfant', 'soin'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function seed(now = new Date()): State {
  const today = isoDate(now);
  const r = rng(Number(today.replace(/-/g, '')));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;
  const id = (prefix: string, n = 7) => prefix + Array.from({ length: n }, () => pick([...CODE_ALPHABET])).join('');
  const state: State = { v: 2, bookings: [], messages: [], closures: [], clients: [] };

  for (let i = 18; i < 28; i++) {
    const d = addDays(today, i);
    if (dayInfo(state, d).open) { state.closures.push({ date: d, reason: 'Formation de l’équipe' }); break; }
  }

  for (let i = -56; i <= 16; i++) {
    const date = addDays(today, i);
    const info = dayInfo(state, date);
    if (!info.open) continue;
    const fill = i < 0 ? 0.72 : i < 3 ? 0.68 : i < 8 ? 0.5 : 0.28;
    for (const b of BARBERS) {
      if (!b.days.includes(weekday(date))) continue;
      let t = info.from;
      while (t < info.to) {
        const sid = pick(WEIGHTED);
        const duration = service(sid).minutes;
        if (r() < fill && !checkPlacement(state, { date, start: t, service: sid, barber: b.id })) {
          const past = i < 0 || (i === 0 && t + duration < minutesOf(now));
          state.bookings.push({
            id: id('b'), code: id('MC-', 5), service: sid, barber: b.id, date, start: t,
            status: past ? (r() < 0.06 ? 'no-show' : 'done') : r() < 0.05 ? 'cancelled' : 'confirmed',
            name: `${pick(FIRST)} ${pick([...LAST])}.`,
            phone: `06 39 98 ${10 + Math.floor(r() * 89)} ${10 + Math.floor(r() * 89)}`,
            email: '', note: '', source: r() < 0.7 ? 'online' : 'phone',
            created: new Date(now.getTime() - Math.max(1, 6 - i) * 864e5 * r()).toISOString(),
          });
          t += duration;
        } else {
          t += STEP * (1 + Math.floor(r() * 2));
        }
      }
    }
  }

  state.messages.push(
    { id: id('m'), name: 'Camille Roux', email: 'camille.roux@example.com', subject: 'Mariage ou groupe', read: false,
      message: 'Bonjour, mon frère se marie le samedi 14 novembre. Serait-il possible de privatiser le salon de 8 h à 10 h pour lui et quatre témoins (coupe + barbe) ? Merci !',
      at: new Date(now.getTime() - 3 * 36e5).toISOString() },
    { id: id('m'), name: 'Jérôme Martin', email: 'j.martin@example.com', subject: 'Carte cadeau', read: true,
      message: 'Bonjour, proposez-vous des cartes cadeaux pour un rasage à l’ancienne ? Je voudrais en offrir une pour Noël.',
      at: new Date(now.getTime() - 2 * 864e5).toISOString() },
  );
  return state;
}
