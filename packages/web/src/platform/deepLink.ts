import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isElectron } from './platform';

/**
 * Listens for deep link events from the Electron main process and navigates accordingly.
 *
 * Supported routes (accepted with both the vertex:// and legacy backspace:// schemes):
 *   vertex://join/{code}            → /join/{code}
 *   vertex://join/{code}@{host}     → /join/{code}@{host}
 *   vertex://channel/{spaceId}/{channelId} → /channels/{spaceId}/{channelId}
 */
export function useDeepLinkHandler(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isElectron()) return;

    const api = window.backspace!;
    api.onDeepLink((url: string) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        console.warn('[DeepLink] Invalid URL:', url);
        return;
      }

      // Accept both the vertex:// scheme and the legacy backspace:// scheme
      // (older installers registered backspace:// as the protocol handler).
      if (parsed.protocol !== 'vertex:' && parsed.protocol !== 'backspace:') return;

      // URL host + pathname gives us the route
      // vertex://join/code  → host="join", pathname="/code"
      // vertex://channel/spaceId/channelId → host="channel", pathname="/spaceId/channelId"
      const host = parsed.hostname;
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (host === 'join' && pathParts.length >= 1) {
        const code = pathParts[0]!;
        navigate(`/join/${code}`);
      } else if (host === 'channel' && pathParts.length >= 2) {
        const spaceId = pathParts[0]!;
        const channelId = pathParts[1]!;
        navigate(`/channels/${spaceId}/${channelId}`);
      } else {
        console.warn('[DeepLink] Unknown route:', url);
      }
    });

    // Origin-aware /join/ interception from the main process
    const offInternal = api.onOpenInternalRoute((path: string) => {
      // path is e.g. '/join/cb265c4e' — already a normalized React Router path
      navigate(path);
    });
    return () => { offInternal(); };
  }, [navigate]);
}
