import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../../contexts/LanguageContext';
import termsMd from '../../../../../TERMS.md?raw';
import privacyMd from '../../../../../PRIVACY.md?raw';

/**
 * Página legal (/terms y /privacy): renderiza el markdown de TERMS.md /
 * PRIVACY.md (bilingüe ES/EN en el mismo archivo — se muestra la sección del
 * idioma activo, con la otra colapsada al final). Accesible sin sesión
 * (fuera de ProtectedRoute) para que se vea desde login/registro.
 */

function sectionOf(md: string, lang: 'es' | 'en'): string {
  // Cada doc separa los idiomas con '---' y una cabecera '## 🇪🇸 Español' / '## 🇬🇧 English'.
  const esStart = md.indexOf('## 🇪🇸');
  const enStart = md.indexOf('## 🇬🇧');
  if (esStart === -1 || enStart === -1) return md; // fallback: doc completo
  return lang === 'es' ? md.slice(esStart, enStart) : md.slice(enStart);
}

export function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const md = doc === 'terms' ? termsMd : privacyMd;
  const title = doc === 'terms' ? t('legal_terms_title') : t('legal_privacy_title');

  return (
    <div className="min-h-screen bg-surface-base text-txt-primary">
      <div className="mx-auto max-w-[720px] px-5 py-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-txt-secondary transition-colors hover:border-white/25 motion-reduce:transition-none"
        >
          <span aria-hidden="true">←</span> {t('legal_back')}
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="prose-invert max-w-none text-[13.5px] leading-relaxed text-txt-secondary [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-txt-primary [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-txt-primary [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-txt-primary [&_hr]:my-5 [&_hr]:border-white/10 [&_li]:mb-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2.5 [&_strong]:text-txt-primary [&_ul]:ml-5 [&_ul]:list-disc">
            <ReactMarkdown>{sectionOf(md, language)}</ReactMarkdown>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-txt-tertiary">
          <button type="button" onClick={() => navigate('/terms')} className="hover:text-txt-secondary hover:underline">
            {t('legal_terms_title')}
          </button>
          <span className="mx-1.5">·</span>
          <button type="button" onClick={() => navigate('/privacy')} className="hover:text-txt-secondary hover:underline">
            {t('legal_privacy_title')}
          </button>
        </p>
      </div>
    </div>
  );
}

/** Links legales reutilizables — inline (en pestaña nueva) o bajo el form. */
export function LegalLinks({ newTab = false, className = '' }: { newTab?: boolean; className?: string }) {
  const { t } = useLanguage();
  const sep = <span className="mx-1.5">·</span>;
  const cls = 'hover:text-txt-secondary hover:underline';
  if (newTab) {
    return (
      <span className={className}>
        <a href="/terms" target="_blank" rel="noopener noreferrer" className={cls}>{t('legal_terms_title')}</a>
        {sep}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className={cls}>{t('legal_privacy_title')}</a>
      </span>
    );
  }
  return (
    <span className={className}>
      <a href="/terms" className={cls}>{t('legal_terms_title')}</a>
      {sep}
      <a href="/privacy" className={cls}>{t('legal_privacy_title')}</a>
    </span>
  );
}
