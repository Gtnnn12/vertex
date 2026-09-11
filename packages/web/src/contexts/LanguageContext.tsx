import React, { createContext, useState, useContext, useEffect } from 'react';
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

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('lang') as Language) || 'es';
  });

  useEffect(() => {
    localStorage.setItem('lang', language);
  }, [language]);

  const t = (key: string) => {
    return translate(translations[language], key, language);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

const translate = (table: Record<TranslationKey, string>, key: string, lang?: Language): string => {
  if (!Object.prototype.hasOwnProperty.call(table, key)) {
    // Missing-key sentinel: makes raw-key leaks visible in DevTools immediately.
    console.warn(`[i18n] Missing key: "${key}"${lang ? ` (lang: ${lang})` : ''}`);
  }
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key as TranslationKey] : key;
};

const FALLBACK_CONTEXT: LanguageContextType = {
  language: 'en',
  setLanguage: () => undefined,
  t: (key) => translate(en, key, 'en'),
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return FALLBACK_CONTEXT;
  }
  return context;
};

/**
 * Translate outside React (stores, WS handlers): reads the same `lang`
 * localStorage key the provider persists, with English fallback.
 */
export function translateStatic(key: string): string {
  try {
    const lang = (localStorage.getItem('lang') as Language) || 'es';
    const table = translations[lang] ?? en;
    return translate(table, key, lang);
  } catch {
    return translate(en, key);
  }
}
