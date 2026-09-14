import { useLanguage } from '../../../contexts/LanguageContext';

// [TEMP-TRACE] valor leído al montar — lo que un reload aplicará.
console.log(`[lang-panel mount] localStorage.lang=${localStorage.getItem('lang')}`);

export function LanguagePanel() {
  const { language, setLanguage, t } = useLanguage();

  const options = [
    { value: 'es' as const, label: 'Español', flag: '🇪🇸' },
    { value: 'en' as const, label: 'English', flag: '🇬🇧' },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('language')}</h2>
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3.5 space-y-2">
        {options.map((opt) => {
          const selected = language === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                // [TEMP-TRACE] valor guardado al click.
                console.log(`[lang-panel click] → ${opt.value}`);
                setLanguage(opt.value);
                console.log(`[lang-panel click] stored=${localStorage.getItem('lang')} context=${language}`);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                selected
                  ? 'bg-interactive-selected text-txt-primary'
                  : 'hover:bg-interactive-hover text-txt-secondary'
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="text-base">{opt.flag}</span>
                {opt.label}
              </span>
              {selected && (
                <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-txt-tertiary">
        {t('interface_language_note')}
      </p>
    </div>
  );
}
