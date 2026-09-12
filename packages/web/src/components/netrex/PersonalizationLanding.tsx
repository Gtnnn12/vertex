import { useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { VERTEXAppPreview, buildPreviewState, DEFAULT_PREVIEW } from './VERTEXAppPreview';

const NETREX_PREFS_KEY = 'vertex.netrex.preferences';

function loadNetrexPrefs() {
  try {
    const raw = localStorage.getItem(NETREX_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const FEATURES = [
  { labelKey: 'netrex_feature_effects', tone: 'rgba(196,181,253,0.85)' },
  { labelKey: 'netrex_feature_backgrounds', tone: 'rgba(125,211,252,0.85)' },
  { labelKey: 'netrex_feature_profile_themes', tone: 'rgba(134,239,172,0.85)' },
  { labelKey: 'netrex_feature_presence', tone: 'rgba(252,211,77,0.85)' },
];

export function PersonalizationLanding() {
  const { t } = useLanguage();
  const openModal = useUIStore((s) => s.openModal);

  const preview = useMemo(() => {
    const saved = loadNetrexPrefs();
    return Object.keys(saved).length > 0 ? buildPreviewState(saved) : DEFAULT_PREVIEW;
  }, []);

  const handleOpenEditor = () => {
    openModal('personalization');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
      {/* Copy + CTA */}
      <div className="lg:col-span-5 space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-mint">✦</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-txt-tertiary">
            {t('personalize_vertex')}
          </span>
        </div>
        <h2 className="text-[32px] md:text-[36px] font-bold tracking-[-0.03em] text-txt-primary leading-tight">
          {t('personalize_title')}
        </h2>
        <p className="text-[14px] leading-relaxed text-txt-secondary max-w-[46ch]">
          {t('personalize_landing_desc')}
        </p>

        <ul className="space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f.labelKey} className="flex items-center gap-3 text-[12.5px] text-txt-secondary">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: f.tone }} />
              <span className="font-medium text-txt-primary">{t(f.labelKey)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={handleOpenEditor}
            className="px-6 py-2.5 rounded-xl bg-accent-mint/10 border border-accent-mint/25 text-[13px] font-semibold text-accent-mint hover:bg-accent-mint/15 hover:border-accent-mint/35 transition-all duration-200"
          >
            {t('view_personalization')}
          </button>
          <span className="text-[11px] text-txt-tertiary">
            {t('live_preview')}
          </span>
        </div>
      </div>

      {/* Integrated app preview — the real VERTEX chrome, not an isolated mockup */}
      <div className="lg:col-span-7">
        <VERTEXAppPreview preview={preview} />
      </div>
    </div>
  );
}