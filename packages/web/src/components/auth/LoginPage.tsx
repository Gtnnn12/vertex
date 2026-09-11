import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { api, RateLimitError, NetworkError } from '../../api/client';
import type { InstanceInfoResponse } from '@backspace/shared';
import { SourceCodeLink } from '../ui/SourceCodeLink';
import { requestPostLoginCards } from './postLoginCardsHost';
import { useLanguage } from '../../contexts/LanguageContext';
import { Mascot, type MascotState } from '../mascot/Mascot';

export function LoginPage() {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);

  // Original VERTEX login ritual: the mascot lives with the form and reacts
  // to it — covering its eyes whenever the password field is focused.
  const [passwordFocused, setPasswordFocused] = useState(false);
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const mascotState: MascotState = error
    ? 'error'
    : isLoading
      ? 'loading'
      : passwordFocused
        ? 'password'
        : username
          ? 'typing'
          : 'idle';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  // Redirect target captured at login time; the card-ritual overlay uses it
  // to navigate into the app when it finishes.
  const pendingRedirectRef = useRef<string | null>(null);

  // AGPL § 13: anonymous users must be able to reach the source of the running
  // version. Fetched from the unauthenticated public info endpoint.
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfoResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.instance.info()
      .then((info) => { if (!cancelled) setInstanceInfo(info); })
      .catch(() => { /* Non-critical — link is simply omitted if unreachable. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      await login(username.trim(), password);
      // Remember where to go and request the card ritual. The overlay is an
      // App-level singleton (mounted in main.tsx): it survives the route swap
      // that the session token triggers, and it owns the navigation into the
      // app when it finishes. If anything fails, the bus navigates directly —
      // login is never blocked.
      pendingRedirectRef.current =
        redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/channels/@me';
      requestPostLoginCards({
        displayName: username.trim(),
        fast: new URLSearchParams(window.location.search).has('fastcards'),
        onDone: () => {
          const r = pendingRedirectRef.current;
          if (r) navigate(r);
        },
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRetryAfter(err.retryAfter);
        setError('');
      } else if (err instanceof NetworkError) {
        setError(t('login_server_unreachable'));
      } else {
        setError(err instanceof Error ? err.message : t('login_failed'));
      }
    }
  };

  const isDisabled = isLoading || retryAfter > 0;

  return (
    <div className="min-h-full flex items-center justify-center bg-surface-base relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,108,246,0.06)_0%,transparent_50%)]" />
      <div className="w-full max-w-[480px] bg-surface-elevated rounded-md p-8 shadow-elevation-high relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <Mascot state={mascotState} className="mb-4" />
          <h1 className="text-2xl font-bold text-txt-primary">{t('welcome_back')}</h1>
          <p className="text-txt-tertiary mt-1">{t('welcome_back_subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {retryAfter > 0 && (
            <div className="mb-4 p-3 bg-accent-amber/10 border border-accent-amber/30 rounded text-sm">
              <p className="font-medium text-accent-amber">{t('too_many_attempts')}</p>
              <p className="text-txt-secondary mt-0.5">{t('try_again_in')} {retryAfter}s</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">
              {error}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-bold text-txt-secondary uppercase mb-2">
              {t('username')} <span className="text-txt-danger">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-standard w-full py-2.5"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs font-bold text-txt-secondary uppercase mb-2">
              {t('password')} <span className="text-txt-danger">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-standard w-full py-2.5"
              autoComplete="current-password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
          </div>

          <button
            type="submit"
            disabled={isDisabled}
            className="w-full py-2.5 bg-accent-primary hover:bg-accent-primary/80 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retryAfter > 0
              ? `${t('try_again_in')} ${retryAfter}s`
              : isLoading
                ? t('logging_in')
                : t('login')}
          </button>

          <p className="mt-3 text-sm text-txt-tertiary">
            {t('need_an_account')}{' '}
            <Link to={`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="text-accent-primary hover:underline">
              {t('register')}
            </Link>
          </p>
        </form>

        {instanceInfo && (
          <div className="mt-6 pt-4 border-t border-white/[0.04] flex justify-center">
            <SourceCodeLink sourceCodeUrl={instanceInfo.sourceCodeUrl} version={instanceInfo.version} commit={instanceInfo.commit} />
          </div>
        )}
      </div>

      <p className="absolute bottom-4 inset-x-0 text-center text-[11px] text-txt-tertiary/70 select-none">
        created by gitano
      </p>
    </div>
  );
}
