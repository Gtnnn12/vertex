import { useEffect } from 'react';
import { ConnectedInstances } from '../ConnectedInstances';
import { useLanguage } from '../../../contexts/LanguageContext';
import { SettingsCard } from './_shared/SettingsCard';
import { useSpotifyStore } from '../../../stores/spotifyStore';
import { useAuthStore } from '../../../stores/authStore';
import { SpotifyGlyph } from '../../spotify/SpotifyVinyl';

/** Authorize navigation URL — session JWT travels as ?token= because a
 *  browser navigation cannot set an Authorization header. */
function authorizeUrl(): string {
  const token = useAuthStore.getState().token;
  return `/api/spotify/authorize${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function ConnectionsPanel() {
  const { t } = useLanguage();
  const { connected, spotifyUser, loaded, refresh, disconnect } = useSpotifyStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // OAuth callback lands back on /settings?spotify=connected|error — surface it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      void refresh();
      // Clean the query so refreshes don't re-trigger.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary">{t('connections')}</h2>

      <SettingsCard title={t('spotify_settings_title')} description={t('spotify_settings_desc')}>
        {!loaded ? (
          <div className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />
        ) : connected ? (
          <div className="flex items-center gap-3">
            <SpotifyGlyph className="h-5 w-5 flex-shrink-0 text-[#1DB954]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-txt-primary">{t('spotify_connected')}</p>
              {spotifyUser && (
                <p className="truncate text-[11.5px] text-txt-tertiary">{spotifyUser}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="flex-shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-txt-secondary transition-colors hover:border-white/20 hover:text-txt-primary"
            >
              {t('spotify_disconnect')}
            </button>
          </div>
        ) : (
          <a
            href={authorizeUrl()}
            onClick={(e) => {
              e.preventDefault();
              window.location.href = authorizeUrl();
            }}
            className="inline-flex items-center gap-2.5 rounded-lg bg-[#1DB954] px-4 py-2 text-[13px] font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <SpotifyGlyph className="h-4 w-4" />
            {t('spotify_connect')}
          </a>
        )}
      </SettingsCard>

      <SettingsCard title={t('connections')} description={t('connections_description')}>
        <div className="-mx-1">
          <ConnectedInstances />
        </div>
      </SettingsCard>
    </div>
  );
}
