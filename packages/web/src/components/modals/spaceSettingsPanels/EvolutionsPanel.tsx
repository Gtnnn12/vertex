import { useState } from 'react';
import { useSpaceStore, getApiForOrigin, getMyUserIdForOrigin } from '../../../stores/spaceStore';
import { useUIStore } from '../../../stores/uiStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { MAX_EVO_LEVEL, EVO_CHANNEL_LIMITS } from '@backspace/shared/src/evoConstants.js';

interface EvolutionsPanelProps {
  spaceId: string;
}

const LEVELS = [0, 1, 2];

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

      {/* Level cards */}
      <div className="space-y-2.5">
        {LEVELS.map((lvl) => {
          const limits = EVO_CHANNEL_LIMITS[lvl as 0 | 1 | 2];
          const isCurrent = lvl === currentLevel;
          return (
            <div
              key={lvl}
              className={`rounded-lg p-3.5 border transition-colors ${
                isCurrent
                  ? 'bg-interactive-selected border-accent-primary/40'
                  : 'bg-white/[0.02] border-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-medium text-txt-primary">
                  {lvl === 0 ? t('evo_level_base') : t('evo_level_n').replace('{n}', String(lvl))}
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary">
                    {t('evo_current')}
                  </span>
                )}
              </div>
              <div className="text-xs text-txt-tertiary">
                {t('evo_benefit_channels')
                  .replace('{text}', String(limits.text))
                  .replace('{voice}', String(limits.voice))}
              </div>
            </div>
          );
        })}
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
