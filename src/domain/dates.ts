// Local calendar dates as "YYYY-MM-DD" strings and times as minutes since midnight.
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export const weekday = (iso: string): number => parseDate(iso).getDay();

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const day = weekday(iso);
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const minutesOf = (d: Date): number => d.getHours() * 60 + d.getMinutes();

export function atTime(iso: string, minutes: number): Date {
  const d = parseDate(iso);
  d.setMinutes(minutes);
  return d;
}

export const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;
