const STORAGE_KEY = 'vertex:lastSeenVersion';

function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Compare two semver-ish version strings ("1.0.3", "v1.0.3").
 * Returns true when `current` is strictly greater than `previous`.
 * Unparseable versions never count as an upgrade (avoids false positives).
 */
export function isNewerVersion(current: string, previous: string): boolean {
  const cur = parseSemver(current);
  const prev = parseSemver(previous);
  if (!cur || !prev) return false;
  if (cur[0] !== prev[0]) return cur[0] > prev[0];
  if (cur[1] !== prev[1]) return cur[1] > prev[1];
  return cur[2] > prev[2];
}

/**
 * Returns the version the user just upgraded FROM, or null if this is not
 * the first run after an update. Marks the current version as seen as a
 * side effect, so the upgrade is only reported once per version.
 */
export function consumeUpgradedFromVersion(currentVersion: string): string | null {
  try {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, currentVersion);
    if (!previous) return null; // First ever run — nothing to celebrate.
    if (previous === currentVersion) return null;
    return isNewerVersion(currentVersion, previous) ? previous : null;
  } catch {
    return null;
  }
}
