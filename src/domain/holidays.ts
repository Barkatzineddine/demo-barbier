// French public holidays, including the ones that move with Easter (anonymous Gregorian algorithm).
import { addDays, isoDate } from './dates';

export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(new Date(year, month - 1, day));
}

export type HolidayId = 'newYear' | 'easterMonday' | 'labour' | 'victory' | 'ascension' | 'whitMonday' | 'bastille' | 'assumption' | 'allSaints' | 'armistice' | 'christmas';

const cache = new Map<number, Map<string, HolidayId>>();

export function holiday(iso: string): HolidayId | null {
  const year = Number(iso.slice(0, 4));
  let map = cache.get(year);
  if (!map) {
    const easter = easterSunday(year);
    map = new Map<string, HolidayId>([
      [`${year}-01-01`, 'newYear'], [addDays(easter, 1), 'easterMonday'], [`${year}-05-01`, 'labour'],
      [`${year}-05-08`, 'victory'], [addDays(easter, 39), 'ascension'], [addDays(easter, 50), 'whitMonday'],
      [`${year}-07-14`, 'bastille'], [`${year}-08-15`, 'assumption'], [`${year}-11-01`, 'allSaints'],
      [`${year}-11-11`, 'armistice'], [`${year}-12-25`, 'christmas'],
    ]);
    cache.set(year, map);
  }
  return map.get(iso) ?? null;
}
