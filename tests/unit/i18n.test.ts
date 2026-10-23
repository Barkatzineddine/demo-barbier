// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dictionaries } from '../../src/i18n';
import { interpolate } from '../../src/shared/i18n';
import { fuzzyScore } from '../../src/shared/ui/CommandPalette';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const fr = Object.entries(dictionaries.fr);
  it('has every French key in English, and nothing more', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(fr.map(([k]) => k).sort());
  });
  it('has no empty string', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), `${lang}:${k}`).not.toBe('');
    }
  });
  it('uses the same placeholders in both languages', () => {
    for (const [k, v] of fr) expect(placeholders(dictionaries.en[k as keyof typeof dictionaries.en]), k).toEqual(placeholders(v));
  });
  it('interpolates values and leaves unknown placeholders visible', () => {
    expect(interpolate('{n} rendez-vous le {day}', { n: 3, day: 'mardi' })).toBe('3 rendez-vous le mardi');
    expect(interpolate('Bonjour {name}')).toBe('Bonjour {name}');
  });
});

describe('command palette search', () => {
  it('prefers contiguous matches, earlier ones first', () => {
    expect(fuzzyScore('karim', 'Karim · coupe')).toBeGreaterThan(fuzzyScore('karim', 'Coupe · Karim'));
    expect(fuzzyScore('kar', 'Karim')).toBeGreaterThan(fuzzyScore('krm', 'Karim'));
  });
  it('ignores case and accents', () => {
    expect(fuzzyScore('ines', 'Inès')).toBeGreaterThan(0);
    expect(fuzzyScore('INÈS', 'ines')).toBeGreaterThan(0);
  });
  it('matches initials out of order as nothing', () => {
    expect(fuzzyScore('mk', 'Karim M')).toBe(-1);
    expect(fuzzyScore('zz', 'Karim')).toBe(-1);
  });
});
