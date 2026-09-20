import { describe, it, expect, beforeEach } from 'vitest';
import { isNewerVersion, consumeUpgradedFromVersion } from './lastSeenVersion';

describe('isNewerVersion', () => {
  it('detects patch upgrades', () => {
    expect(isNewerVersion('1.0.3', '1.0.2')).toBe(true);
  });

  it('detects minor and major upgrades', () => {
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('same version is not an upgrade', () => {
    expect(isNewerVersion('1.0.3', '1.0.3')).toBe(false);
  });

  it('downgrade is not an upgrade', () => {
    expect(isNewerVersion('1.0.2', '1.0.3')).toBe(false);
  });

  it('tolerates a leading v', () => {
    expect(isNewerVersion('v1.0.3', '1.0.2')).toBe(true);
    expect(isNewerVersion('1.0.3', 'v1.0.2')).toBe(true);
  });

  it('unparseable versions never count as upgrades', () => {
    expect(isNewerVersion('', '1.0.2')).toBe(false);
    expect(isNewerVersion('1.0.3', '')).toBe(false);
    expect(isNewerVersion('dev', '1.0.2')).toBe(false);
  });
});

describe('consumeUpgradedFromVersion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null on first ever run (no previous version stored)', () => {
    expect(consumeUpgradedFromVersion('1.0.3')).toBeNull();
  });

  it('stores the current version after the first run', () => {
    consumeUpgradedFromVersion('1.0.2');
    expect(localStorage.getItem('vertex:lastSeenVersion')).toBe('1.0.2');
  });

  it('reports an upgrade exactly once and then never again', () => {
    consumeUpgradedFromVersion('1.0.2');
    expect(consumeUpgradedFromVersion('1.0.3')).toBe('1.0.2');
    expect(consumeUpgradedFromVersion('1.0.3')).toBeNull();
  });

  it('returns null when downgrading (no modal, but version is recorded)', () => {
    consumeUpgradedFromVersion('1.0.3');
    expect(consumeUpgradedFromVersion('1.0.2')).toBeNull();
    expect(localStorage.getItem('vertex:lastSeenVersion')).toBe('1.0.2');
  });
});
