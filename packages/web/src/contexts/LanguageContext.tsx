import React, { createContext, useCallback, useMemo, useState, useContext, useEffect } from 'react';
import es from '../i18n/es.json';
import en from '../i18n/en.json';

type Language = 'es' | 'en';

type TranslationKey = keyof typeof es;

const translations: Record<Language, Record<TranslationKey, string>> = { es, en };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey | string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// ── Static language store ──────────────────────────────────────────────
// Single source of truth shared by the Provider AND any consumer rendered
// outside it (secondary createRoots, early boot). Before this store the
// out-of-provider fallback was hardcoded English with a NOOP setLanguage —
// any surface mounted there was stuck in English and the Settings selector
// silently did nothing. Now the fallback persists to the same `lang` key and
// notifies its own subscribers, so switching works everywhere.
type LanguageListener = (lang: Language) => void;
const languageListeners = new Set<LanguageListener>();

const readStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem('lang');
    return stored === 'en' || stored === 'es' ? stored : 'es';
  } catch {
    return 'es';
  }
};

let currentLanguage: Language = readStoredLanguage();

function getLanguage(): Language {
  return currentLanguage;
}

function changeLanguage(lang: Language): void {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* storage may be unavailable */
  }
  // Temporary diagnostic: confirms the toggle actually fires and persists.
  console.log(`[i18n] language → ${lang}`);
  languageListeners.forEach((fn) => fn(lang));
}

function subscribeLanguage(fn: LanguageListener): () => void {
  languageListeners.add(fn);
  return () => {
    languageListeners.delete(fn);
  };
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getLanguage);

  useEffect(() => subscribeLanguage(setLanguageState), []);

  const setLanguage = useCallback((lang: Language) => {
    changeLanguage(lang); // notifies subscribers → provider re-renders
  }, []);

  const t = useCallback(
    (key: string) => translate(translations[language], key, language),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
};

const translate = (table: Record<TranslationKey, string>, key: string, lang?: Language): string => {
  if (!Object.prototype.hasOwnProperty.call(table, key)) {
    // Missing-key sentinel: makes raw-key leaks visible in DevTools immediately.
    console.warn(`[i18n] Missing key: "${key}"${lang ? ` (lang: ${lang})` : ''}`);
  }
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key as TranslationKey] : key;
};

/**
 * Hook used OUTSIDE the LanguageProvider (secondary createRoots, early
 * boot): mirrors the static store instead of returning a dead English
 * context — setLanguage actually switches and t() follows the stored lang.
 */
function useLanguageFallback(): LanguageContextType {
  const [lang, setLang] = useState<Language>(getLanguage);
  useEffect(() => subscribeLanguage(setLang), []);
  return {
    language: lang,
    setLanguage: changeLanguage,
    t: useCallback(
      (key: string) => translate(translations[lang], key, lang),
      [lang],
    ),
  };
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLanguageFallback();
  }
  return context;
};

/**
 * Translate outside React (stores, WS handlers): reads the same `lang`
 * localStorage key the provider persists, with English fallback.
 */
export function translateStatic(key: string): string {
  try {
    const lang = getLanguage();
    const table = translations[lang] ?? en;
    return translate(table, key, lang);
  } catch {
    return translate(en, key);
  }
}
