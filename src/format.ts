// Small display helpers that depend on the current language.
import { useCallback } from 'react';
import { service, type ServiceId } from './domain/catalog';
import { hhmm } from './domain/dates';
import { useI18n } from './i18n';

export function useFormat() {
  const i18n = useI18n();
  const { t, date } = i18n;
  const duration = useCallback((min: number) => (min >= 60 ? t('common.hours', { h: Math.floor(min / 60), m: min % 60 ? String(min % 60).padStart(2, '0') : '' }).trim() : t('common.minutes', { n: min })), [t]);
  const when = useCallback((iso: string, start: number) => `${date(iso, { weekday: 'long', day: 'numeric', month: 'long' })} · ${hhmm(start)}`, [date]);
  const shortDay = useCallback((iso: string) => date(iso, { weekday: 'short', day: 'numeric', month: 'short' }), [date]);
  const serviceName = useCallback((id: ServiceId) => t(`svc.${id}.name` as Parameters<typeof t>[0]), [t]);
  const price = useCallback((id: ServiceId) => i18n.money(service(id).price, 0), [i18n]);
  return { ...i18n, duration, when, shortDay, serviceName, price, hhmm };
}
