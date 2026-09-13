import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { startPendingMessageOrchestrator } from './stores/pendingMessageRehydrate';
import { LanguageProvider } from './contexts/LanguageContext';
import { initVertexAppearance, getSavedPreferences, applyPreferences } from './utils/vertexTheme';
import { initNetrexCustomTheme } from './utils/netrexPersonalization';
import './styles/globals.css';
import './styles/statusBubble.css';
import './styles/musicStyles.css';

// DEV self-test (Electron only): exercise the full activation chain
// renderer → preload → IPC → main → Gumroad at boot. Logs all four legs so a
// failure is visible in DevTools AND in the main-process console.
if (import.meta.env.DEV && window.backspace?.activateNetrexLicense) {
  console.log('[license-ipc 1/3 renderer] self-test: preload bridge present, firing…');
  window.backspace
    .activateNetrexLicense('TEST-1234-ABCD-EFGH')
    .then((r: unknown) => {
      console.log('[license-ipc 1/3 renderer] self-test result:', JSON.stringify(r));
      // Expected with a fake key: ok:false, error:'invalid' → "Clave inválida".
      // error:'network' here would mean the main leg broke after boot.
    })
    .catch((e: unknown) => {
      console.error('[license-ipc 1/3 renderer] self-test IPC threw:', e);
    });
}

// Apply persisted appearance (accent / theme / effects) before first paint so
// personalization survives reloads everywhere, not just after visiting /vertex.
// The Netrex custom theme layer (exact colors) is re-applied on top; it also
// re-syncs the accent/effects attributes via the canonical pipeline.
(function bootAppearance() {
  initVertexAppearance();
  try {
    const raw = localStorage.getItem('vertex.customTheme');
    if (raw) {
      const saved = JSON.parse(raw) as { accentId?: string; effect?: string };
      const prefs = getSavedPreferences();
      applyPreferences({
        accent: saved.accentId ?? prefs.accent,
        effects: (saved.effect as typeof prefs.effects) ?? prefs.effects,
      });
    }
  } catch {
    /* ignore */
  }
  initNetrexCustomTheme();
})();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; showStack: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showStack: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    // Renderer is alive enough to show the fallback UI — disarm the boot timer.
    // Without this, the timer fires 20s after a caught render error and
    // overrides the in-app error UI with native recovery, which is wrong.
    // Gated on VITE_FORCE_BOOT_STALL so the smoke harness can suppress both
    // ping paths simultaneously when testing the renderer-stalled recovery path.
    if (import.meta.env.VITE_FORCE_BOOT_STALL) return;
    if (typeof window.backspace?.rendererReady === 'function') {
      window.backspace.rendererReady();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0b0b10',
          color: '#efefef',
          fontFamily: "'DM Sans', sans-serif",
          flexDirection: 'column',
          gap: '16px',
          padding: '24px',
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Something went wrong</h1>
          <p style={{ color: '#a0a0aa', maxWidth: '480px', textAlign: 'center' }}>{this.state.error?.message}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '8px 24px',
                backgroundColor: '#7c6cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 24px',
                backgroundColor: 'transparent',
                color: '#a0a0aa',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Reload Page
            </button>
          </div>
          {this.state.error?.stack && (
            <details
              open={this.state.showStack}
              onToggle={(e) => this.setState({ showStack: (e.target as HTMLDetailsElement).open })}
              style={{ maxWidth: '600px', width: '100%', marginTop: '8px' }}
            >
              <summary style={{ color: '#a0a0aa', cursor: 'pointer', fontSize: '13px' }}>
                Error details
              </summary>
              <pre style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#a0a0aa',
                overflow: 'auto',
                maxHeight: '200px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

startPendingMessageOrchestrator();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
