import { useState } from 'react';
import { useSpaceStore, getApiForOrigin, getMyUserIdForOrigin } from '../../../stores/spaceStore';
import { useUIStore } from '../../../stores/uiStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { MAX_EVO_LEVEL, EVO_CHANNEL_LIMITS, EVO_ROLE_COLOR_LIMITS, EVO_EMOJI_LIMITS } from '@backspace/shared/src/evoConstants.js';

interface EvolutionsPanelProps {
  spaceId: string;
}

const LEVELS = [0, 1, 2];

/** One row of the benefit catalog: min level + i18n key. */
const BENEFIT_ROWS: { key: string; minLevel: number }[] = [
  { key: 'evo_b_channels', minLevel: 0 },
  { key: 'evo_b_banner', minLevel: 1 },
  { key: 'evo_b_animated_icon', minLevel: 1 },
  { key: 'evo_b_role_colors', minLevel: 1 },
  { key: 'evo_b_invite_slug', minLevel: 1 },
  { key: 'evo_b_emojis', minLevel: 1 },
  { key: 'evo_b_event_rooms', minLevel: 1 },
  { key: 'evo_b_animated_banner', minLevel: 2 },
  { key: 'evo_b_role_colors_unlimited', minLevel: 2 },
  { key: 'evo_b_emojis_30', minLevel: 2 },
  { key: 'evo_b_stats', minLevel: 2 },
];

export function EvolutionsPanel({ spaceId }: EvolutionsPanelProps) {
  const spaces = useSpaceStore((s) => s.spaces);
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();

  const space = spaces.find((s) => s.id === spaceId);
  const spaceApi = getApiForOrigin(space?._instanceOrigin ?? '');
  const isOwner = space?.ownerId === getMyUserIdForOrigin((space as any)?._instanceOrigin ?? '');

  const [evolving, setEvolving] = useState(false);
  const [error, setError] = useState('');

  if (!space) return null;

  const currentLevel = space.serverEvoLevel ?? 0;
  const nextLevel = (currentLevel + 1) as 1 | 2;

  const handleEvolve = async () => {
    setEvolving(true);
    setError('');
    try {
      const updated = await spaceApi.spaces.evolve(spaceId, nextLevel);
      // Apply the evolved level directly to the local space row (the PATCH
      // based updateSpace would re-send the whole space as a body).
      useSpaceStore.setState((state) => ({
        spaces: state.spaces.map((s) =>
          s.id === spaceId ? { ...s, serverEvoLevel: updated.serverEvoLevel } : s,
        ),
      }));
      addToast(t('evo_success').replace('{level}', String(updated.serverEvoLevel)), 'success', 2500);
    } catch (err: any) {
      const code = err?.body?.code ?? err?.code;
      if (code === 'netrex_required') {
        setError(t('evo_error_netrex'));
      } else if (code === 'evo_limit_reached' || code === 'evo_limit_base_upgrade') {
        setError(t('evo_error_limit'));
      } else {
        setError(err?.body?.error ?? err?.message ?? t('evo_error_generic'));
      }
    } finally {
      setEvolving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('evo_title')}</h2>
      <p className="text-xs text-txt-tertiary -mt-3">{t('evo_subtitle')}</p>

      {/* Full benefit catalog: 🔒 locked / ✅ unlocked per level column */}
      <div className="rounded-lg border border-white/[0.05] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="px-3 py-2 text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">
                {t('evo_table_benefit')}
              </th>
              {LEVELS.map((lvl) => (
                <th
                  key={lvl}
                  className={`px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-center w-20 ${
                    lvl === currentLevel ? 'text-accent-primary' : 'text-txt-tertiary'
                  }`}
                >
                  {lvl === 0 ? t('evo_level_base_short') : t('evo_level_n_short').replace('{n}', String(lvl))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BENEFIT_ROWS.map((row) => {
              const fmt = (key: string, lvl: number): string => {
                let s = t(key);
                if (key === 'evo_b_channels') {
                  const limits = EVO_CHANNEL_LIMITS[lvl as 0 | 1 | 2];
                  s = s.replace('{text}', String(limits.text)).replace('{voice}', String(limits.voice));
                } else if (key === 'evo_b_role_colors') {
                  s = s.replace('{n}', String(EVO_ROLE_COLOR_LIMITS[1]));
                } else if (key === 'evo_b_emojis') {
                  s = s.replace('{n}', String(EVO_EMOJI_LIMITS[1]));
                }
                return s;
              };
              return (
                <tr
                  key={row.key}
                  className={`border-t border-white/[0.04] ${row.minLevel === currentLevel ? 'bg-interactive-selected/30' : ''}`}
                >
                  <td className="px-3 py-2 text-[13px] text-txt-secondary">
                    {row.minLevel === 0
                      ? fmt(row.key, currentLevel)
                      : fmt(row.key, row.minLevel)}
                  </td>
                  {LEVELS.map((lvl) => {
                    const unlocked = lvl >= row.minLevel;
                    return (
                      <td key={lvl} className="px-2 py-2 text-center">
                        <span aria-hidden="true" className={unlocked ? 'text-accent-primary' : 'text-txt-tertiary/50'}>
                          {unlocked ? '✅' : '🔒'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Owner CTA */}
      {isOwner && (
        <div className="rounded-lg bg-white/[0.02] p-3.5">
          {currentLevel >= MAX_EVO_LEVEL ? (
            <p className="text-xs text-txt-tertiary">{t('evo_max_reached')}</p>
          ) : (
            <>
              <button
                onClick={handleEvolve}
                disabled={evolving}
                className="w-full py-2 rounded-md bg-accent-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {evolving
                  ? t('evo_evolving')
                  : t('evo_evolve_to').replace('{level}', String(nextLevel))}
              </button>
              <p className="text-[11px] text-txt-tertiary mt-2">{t('evo_netrex_hint')}</p>
            </>
          )}
          {error && <p className="text-xs text-accent-rose mt-2">{error}</p>}
        </div>
      )}
      {!isOwner && (
        <p className="text-[11px] text-txt-tertiary">{t('evo_owner_only')}</p>
      )}

      {/* Freeze rule note */}
      <p className="text-[11px] text-txt-tertiary">{t('evo_freeze_note')}</p>
    </div>
  );
}
