import { useMemo, useEffect, useState } from 'react';
import type { Activity } from '@backspace/shared';
import { useActivityProviderRegistry, resolveCurrentActivity } from './activityProvider';

/**
 * Resolve the current activity from the provider registry. Re-renders when
 * the set of providers changes or a provider notifies a change (revision
 * counter in the registry store).
 */
export function useCurrentActivity(): Activity | null {
  const revision = useActivityProviderRegistry((s) => s.revision);

  // Guard against notifications landing between render and effect: bump a
  // local state when the registry revision changes after mount.
  const [seenRevision, setSeenRevision] = useState(revision);
  useEffect(() => {
    if (revision !== seenRevision) setSeenRevision(revision);
  }, [revision, seenRevision]);

  return useMemo(() => resolveCurrentActivity(), [seenRevision]);
}
