// iCalendar file for one appointment, generated in the browser.
import { barber, service } from './catalog';
import { hhmm } from './dates';
import type { Booking } from './schema';

const escape = (t: string) => t.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
const stamp = (date: string, min: number) => `${date.replace(/-/g, '')}T${hhmm(min).replace(':', '')}00`;

export function bookingToIcs(b: Booking, title: string, now = new Date()): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maison Corbin//Demo//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${b.id}@maison-corbin.example`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${stamp(b.date, b.start)}`,
    `DTEND:${stamp(b.date, b.start + service(b.service).minutes)}`,
    `SUMMARY:${escape(`${title} · Maison Corbin`)}`,
    `LOCATION:${escape('14 montée du Corbeau, 69001 Lyon')}`,
    `DESCRIPTION:${escape(`${barber(b.barber).name} · ${b.code}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${escape(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
