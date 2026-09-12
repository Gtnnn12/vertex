import { describe, it, expect } from 'vitest';
import {
  MUSIC_STYLES,
  resolveMusicStyle,
  isMusicStyleId,
  getMusicStyle,
} from './musicStyles';

describe('musicStyles registry', () => {
  it('exposes all nine catalogue styles', () => {
    expect(MUSIC_STYLES.map((s) => s.id)).toEqual([
      'vinyl',
      'cassette',
      'holographic-cd',
      'crystal-orbit',
      'spectrum',
      'boombox',
      'glass-prism',
      'arcade',
      'kawaii-dream',
    ]);
  });

  it('marks only vinyl and arcade as free', () => {
    const free = MUSIC_STYLES.filter((s) => !s.requiresNetrex).map((s) => s.id);
    expect(free).toEqual(['vinyl', 'arcade']);
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
    expect(resolveMusicStyle('arcade', false)).toBe('arcade');
    expect(resolveMusicStyle('arcade', true)).toBe('arcade');
  });

  it('keeps premium styles when the user is Netrex', () => {
    expect(resolveMusicStyle('boombox', true)).toBe('boombox');
    expect(resolveMusicStyle('holographic-cd', true)).toBe('holographic-cd');
  });

  it('falls back to vinyl for premium styles without entitlement', () => {
    expect(resolveMusicStyle('cassette', false)).toBe('vinyl');
    expect(resolveMusicStyle('spectrum', false)).toBe('vinyl');
    expect(resolveMusicStyle('glass-prism', false)).toBe('vinyl');
  });

  it('falls back to vinyl for unknown or missing values', () => {
    expect(resolveMusicStyle(undefined, true)).toBe('vinyl');
    expect(resolveMusicStyle('not-a-style' as never, true)).toBe('vinyl');
  });
});

describe('helpers', () => {
  it('isMusicStyleId validates ids', () => {
    expect(isMusicStyleId('vinyl')).toBe(true);
    expect(isMusicStyleId('boombox')).toBe(true);
    expect(isMusicStyleId('nope')).toBe(false);
    expect(isMusicStyleId(null)).toBe(false);
    expect(isMusicStyleId(42)).toBe(false);
  });

  it('getMusicStyle never throws and defaults to vinyl', () => {
    expect(getMusicStyle('cassette').id).toBe('cassette');
    expect(getMusicStyle('nope' as never).id).toBe('vinyl');
  });
});
