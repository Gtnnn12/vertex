import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Mascot } from '../mascot/Mascot';

type StartupState = 'showing' | 'ready' | 'hidden';

export function Startup() {
  const { t } = useLanguage();
  const [state, setState] = useState<StartupState>('showing');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    mq.addEventListener('change', () => setReducedMotion(mq.matches));
    return () => mq.removeEventListener('change', () => setReducedMotion(mq.matches));
  }, []);

  const duration = reducedMotion ? 0 : 300;

  useEffect(() => {
    if (state === 'showing') {
      const timer = setTimeout(() => {
        setState('ready');
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [state, duration]);

  useEffect(() => {
    // After startup completes, hide after a brief delay to allow
    // the initial render to settle, then let React Router handles
    // the auth flow (login vs protected routes).
    const timer = setTimeout(() => {
      setState('hidden');
    }, duration + 100);
    return () => clearTimeout(timer);
  }, [state, duration]);

  if (state === 'hidden') return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-surface-base z-50 motion-reduce:duration-0"
      style={{ transitionDuration: reducedMotion ? '0s' : '0.3s' }}
    >
      <div className="bg-surface-elevated rounded-2xl p-8 text-center transform transition-transform" style={{ transitionDuration: `${duration}ms` }}>
        <Mascot state="startup" className="mx-auto w-16 h-16 mb-4" />
        <h2 className="text-2xl font-bold text-txt-primary mb-2">{t('startup_preparing')}</h2>
        <p className="text-txt-tertiary mb-8">{t('startup_please_wait')}</p>
        {state === 'ready' && (
          <p className="text-txt-primary font-medium">{t('startup_ready')}</p>
        )}
      </div>
    </div>
  );
}