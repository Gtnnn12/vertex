import { useCallback, useEffect, useState } from 'react';
import { getApiForOrigin, getMyUserIdForOrigin } from '../../../stores/spaceStore';
import { useSpaceStore } from '../../../stores/spaceStore';
import { useUIStore } from '../../../stores/uiStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { EVO_CHANNEL_LIMITS, EVO_ROLE_COLOR_LIMITS, EVO_EMOJI_LIMITS } from '@backspace/shared/src/evoConstants.js';
import type { BoostState } from '@backspace/shared';

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
  const myUserId = getMyUserIdForOrigin((space as any)?._instanceOrigin ?? '');
  const isOwner = space?.ownerId === myUserId;

  const [boostState, setBoostState] = useState<BoostState | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [error, setError] = useState('');

  const currentLevel = boostState?.effectiveLevel ?? 0;

  const refresh = useCallback(async () => {
    try {
      const state = await spaceApi.spaces.boosts(spaceId);
      setBoostState(state);
    } catch {
      // Panel stays on its loading/empty state — the settings shell handles
      // global errors; a transient boosts failure must not brick the panel.
    }
  }, [spaceApi, spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleBoost = async () => {
    setBoosting(true);
    setError('');
    try {
      const res = await spaceApi.spaces.boost(spaceId);
      // Optimistic local sync of the derived level (the broadcast also lands).
      useSpaceStore.setState((state) => ({
        spaces: state.spaces.map((s) =>
          s.id === spaceId ? { ...s, serverEvoLevel: res.serverEvoLevel } : s,
        ),
      }));
      if (res.serverEvoLevel > res.previousLevel) {
        addToast(t('evo_level_up').replace('{level}', String(res.serverEvoLevel)), 'success', 2500);
      } else {
        addToast(t('evo_boost_success'), 'success', 2500);
      }
      await refresh();
    } catch (err: any) {
      const code = err?.body?.code ?? err?.code;
      if (code === 'no_boost_credits') {
        setError(t('evo_error_no_credits'));
      } else if (code === 'not_member') {
        setError(t('evo_error_membership'));
      } else {
        setError(err?.body?.error ?? err?.message ?? t('evo_error_generic'));
      }
    } finally {
      setBoosting(false);
    }
  };

  if (!space) return null;

  const active = boostState?.activeBoosts ?? 0;
  const toL1 = Math.max(boostState ? boostState.boostsForLevel1 - active : 0, 0);
  const toL2 = Math.max(boostState ? boostState.boostsForLevel2 - active : 0, 0);
  const progress = boostState
    ? Math.min(active / boostState.boostsForLevel2, 1)
    : 0;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('evo_title')}</h2>
      <p className="text-xs text-txt-tertiary -mt-3">{t('evo_subtitle')}</p>

      {/* ─── Nivel actual + progreso de mejoras (visible para TODOS) ─── */}
      <div className="rounded-lg bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-txt-primary">
            {t('evo_current_level').replace('{level}', String(currentLevel))}
          </span>
          <span className="text-[12px] text-txt-tertiary">
            {t('evo_active_boosts').replace('{n}', String(active))}
          </span>
        </div>

        {/* Barra de progreso hacia Nivel 2 (0..10 mejoras). */}
        <div className="mt-3 h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-accent-primary transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
            role="progressbar"
            aria-valuenow={active}
            aria-valuemin={0}
            aria-valuemax={boostState?.boostsForLevel2 ?? 10}
          />
        </div>

        <p className="mt-2 text-[11.5px] text-txt-tertiary">
          {currentLevel === 0 && t('evo_progress_l1').replace('{n}', String(toL1))}
          {currentLevel === 1 && t('evo_progress_l2').replace('{n}', String(toL2))}
          {currentLevel >= 2 && t('evo_progress_max')}
        </p>

        {boostState && boostState.myBoosts > 0 && (
          <p className="mt-1 text-[11.5px] text-txt-secondary">
            {t('evo_my_boosts').replace('{n}', String(boostState.myBoosts))}
          </p>
        )}

        {/* CTA de compra — cualquier MIEMBRO puede mejorar el server. */}
        {boostState && (
          <button
            onClick={handleBoost}
            disabled={boosting || boostState.myCredits < 1}
            title={boostState.myCredits < 1 ? t('evo_error_no_credits') : undefined}
            className="mt-3 w-full py-2 rounded-md bg-accent-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {boosting
              ? t('evo_boosting')
              : t('evo_boost_cta')}
          </button>
        )}
        {boostState && boostState.myCredits > 0 && (
          <p className="mt-1.5 text-[11px] text-txt-tertiary">
            {t('evo_credits_available').replace('{n}', String(boostState.myCredits))}
          </p>
        )}
        {error && <p className="text-xs text-accent-rose mt-2">{error}</p>}

        <p className="mt-2 text-[11px] text-txt-tertiary">{t('evo_community_note')}</p>
      </div>

      {/* Tabla de beneficios por nivel: 🔒 locked / ✅ unlocked */}
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

      {/* Freeze rule note */}
      <p className="text-[11px] text-txt-tertiary">{t('evo_freeze_note')}</p>

      {/* Owners keep a hint: they no longer buy directly. */}
      {isOwner && (
        <p className="text-[11px] text-txt-tertiary">{t('evo_owner_hint')}</p>
      )}
    </div>
  );
}
