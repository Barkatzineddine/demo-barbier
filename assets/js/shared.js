// Helpers shared by the client views: "my bookings" list on this device, calendar export.
import { download, hhmm } from './core.js';
import { service, barber, bookingDate, CANCEL_LIMIT_MIN } from './data.js';

const MINE_KEY = 'corbin:mine';

export function mineIds() {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length <= 20).slice(-50) : [];
  } catch { return []; }
}

export function rememberMine(id) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify([...new Set([...mineIds(), id])])); } catch { /* storage blocked */ }
}

export const canCancel = (b, now = new Date()) =>
  b.status === 'confirmé' && bookingDate(b).getTime() - now.getTime() >= CANCEL_LIMIT_MIN * 60e3;

/** iCalendar file for one booking, generated in the browser. */
export function icsFor(b) {
  const s = service(b.service);
  const stamp = (date, min) => `${date.replace(/-/g, '')}T${hhmm(min).replace(':', '')}00`;
  const esc = (t) => t.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maison Corbin//Demo//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${b.id}@maison-corbin.example`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${stamp(b.date, b.start)}`,
    `DTEND:${stamp(b.date, b.start + s.min)}`,
    `SUMMARY:${esc(`${s.name} · Maison Corbin`)}`,
    `LOCATION:${esc('14 montée du Corbeau, 69001 Lyon')}`,
    `DESCRIPTION:${esc(`Avec ${barber(b.barber).name}. Code de réservation : ${b.code}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous chez Maison Corbin', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  download(`rdv-maison-corbin-${b.date}.ics`, lines.join('\r\n'), 'text/calendar');
}
