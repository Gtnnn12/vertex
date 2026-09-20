import { describe, it, expect } from 'vitest';
import {
  MUSIC_STYLES,
  resolveMusicStyle,
  isMusicStyleId,
  getMusicStyle,
} from './musicStyles';

describe('musicStyles registry', () => {
  it('exposes the 2026-09 catalog (vinyl + 8)', () => {
    expect(MUSIC_STYLES.map((s) => s.id)).toEqual([
      'vinyl',
      'aurora',
      'pixel-paradise',
      'kawaii-dream',
      'neon-city',
      'holo-room',
      'nihon',
      'sweetie',
      'ink-panic',
    ]);
  });

  it('marks vinyl, aurora and pixel-paradise as free', () => {
    const free = MUSIC_STYLES.filter((s) => !s.requiresNetrex).map((s) => s.id);
    expect(free).toEqual(['vinyl', 'aurora', 'pixel-paradise']);
  });

  it('every entry has localized label and description keys', () => {
    for (const s of MUSIC_STYLES) {
      expect(s.nameKey).toMatch(/^music_style_\w+_name$/);
      expect(s.descKey).toMatch(/^music_style_\w+_desc$/);
    }
  });
});

describe('resolveMusicStyle entitlement fallback', () => {
  it('returns the saved style when free, regardless of entitlement', () => {
    expect(resolveMusicStyle('vinyl', false)).toBe('vinyl');
    expect(resolveMusicStyle('aurora', false)).toBe('aurora');
    expect(resolveMusicStyle('pixel-paradise', true)).toBe('pixel-paradise');
  });

  it('keeps premium styles when the user is Netrex', () => {
    expect(resolveMusicStyle('kawaii-dream', true)).toBe('kawaii-dream');
    expect(resolveMusicStyle('ink-panic', true)).toBe('ink-panic');
  });

  it('falls back to vinyl for premium styles without entitlement', () => {
    expect(resolveMusicStyle('nihon', false)).toBe('vinyl');
    expect(resolveMusicStyle('sweetie', false)).toBe('vinyl');
    expect(resolveMusicStyle('neon-city', false)).toBe('vinyl');
  });

  it('falls back to vinyl for REMOVED legacy styles (catalog migration)', () => {
    expect(resolveMusicStyle('cassette' as never, true)).toBe('vinyl');
    expect(resolveMusicStyle('arcade' as never, true)).toBe('vinyl');
    expect(resolveMusicStyle('boombox' as never, true)).toBe('vinyl');
    expect(resolveMusicStyle('glass-prism' as never, false)).toBe('vinyl');
  });

  it('falls back to vinyl for unknown or missing values', () => {
    expect(resolveMusicStyle(undefined, true)).toBe('vinyl');
    expect(resolveMusicStyle('not-a-style' as never, true)).toBe('vinyl');
  });
});

describe('helpers', () => {
  it('isMusicStyleId validates ids', () => {
    expect(isMusicStyleId('vinyl')).toBe(true);
    expect(isMusicStyleId('aurora')).toBe(true);
    expect(isMusicStyleId('cassette')).toBe(false);
    expect(isMusicStyleId('nope')).toBe(false);
    expect(isMusicStyleId(null)).toBe(false);
    expect(isMusicStyleId(42)).toBe(false);
  });

  it('getMusicStyle never throws and defaults to vinyl', () => {
    expect(getMusicStyle('nihon').id).toBe('nihon');
    expect(getMusicStyle('cassette' as never).id).toBe('vinyl');
    expect(getMusicStyle('nope' as never).id).toBe('vinyl');
  });
});
