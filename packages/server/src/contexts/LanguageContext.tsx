import React, { createContext, useState, useContext, useEffect } from 'react';

type Language = 'es' | 'en';

// Traducciones directamente en el código (sin importar JSON)
const translations: Record<Language, Record<string, string>> = {
  es: {
    friends: 'Amigos',
    online: 'En línea',
    pending: 'Pendientes',
    add_friend: 'Añadir amigo',
    direct_messages: 'Mensajes directos',
    no_conversations: 'Sin conversaciones aún',
    no_one_online: 'No hay nadie en línea ahora',
    settings: 'Ajustes',
    language: 'Idioma',
    spanish: 'Español',
    english: 'Inglés',
  },
  en: {
    friends: 'Friends',
    online: 'Online',
    pending: 'Pending',
    add_friend: 'Add Friend',
    direct_messages: 'Direct Messages',
    no_conversations: 'No conversations yet',
    no_one_online: "No one's online right now",
    settings: 'Settings',
    language: 'Language',
    spanish: 'Spanish',
    english: 'English',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
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
    return translations[language]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};