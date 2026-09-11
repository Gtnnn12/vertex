import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Spotify OAuth return page.
 *
 * The Spotify dashboard is registered with the redirect URI
 * `/auth/spotify/callback` (a frontend route, since Spotify requires an exact
 * URI match). Spotify lands the browser HERE with `?code=…&state=…`; we simply
 * forward the full query string to the backend's real handler at
 * `/api/spotify/callback`, which exchanges the code for tokens and bounces
 * back to the app (`/settings?spotify=connected|error`).
 */
export function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  useEffect(() => {
    const qs = searchParams.toString();
    // Full navigation (not client-side routing) — the backend must receive the
    // exact query Spotify sent. If there's no query at all, go home.
    window.location.href = qs ? `/api/spotify/callback?${qs}` : '/channels/@me';
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#1DB954]" />
        <p className="text-[13px] text-white/50">{t('spotify_connecting')}</p>
      </div>
    </div>
  );
}
