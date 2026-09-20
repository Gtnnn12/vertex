import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getElectronAPI } from '../../platform/platform';
import { useVoiceStore } from '../../stores/voiceStore';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { useLanguage } from '../../contexts/LanguageContext';
import { startScreenShare } from '../../utils/screenShare';
import { getCurrentProvider } from '../../media/providerFactory';
import { broadcastVoiceStatus } from '../../utils/voice';
import { useScreenPickerStore } from '../../stores/screenPickerStore';
import { ScreenShareSettingsControls } from './ScreenShareSettingsControls';

// ---------------------------------------------------------------------------
// Zustand micro-store — bridges the event-driven API to React state
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Applications grouping — desktopCapturer returns one entry per window; the
// "Applications" tab groups windows sharing an app icon (fallback: derived
// app name) so users pick the app, then drill into its windows.
// ---------------------------------------------------------------------------

interface AppGroup {
  key: string;
  name: string;
  icon: string | null;
  windows: ElectronScreenSource[];
}

function deriveAppName(windowName: string): string {
  // "Firefox — Private Browsing", "Notepad++ - [file.txt]" → strip the title
  const em = windowName.lastIndexOf(' — ');
  if (em > 0) return windowName.slice(0, em).trim();
  const dash = windowName.lastIndexOf(' - ');
  if (dash > 0) return windowName.slice(0, dash).trim();
  return windowName.trim();
}

function buildApps(windows: ElectronScreenSource[]): AppGroup[] {
  const groups = new Map<string, AppGroup>();
  for (const w of windows) {
    const name = deriveAppName(w.name);
    const key = w.appIconDataUrl ? `icon:${w.appIconDataUrl}` : `name:${name}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, name, icon: w.appIconDataUrl, windows: [] };
      groups.set(key, group);
    }
    group.windows.push(w);
  }
  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = 'screens' | 'windows' | 'apps';

export function ScreenSharePicker() {
  const { t } = useLanguage();
  const { isOpen, sources } = useScreenPickerStore();
  const [activeTab, setActiveTab] = useState<Tab>('screens');
  const [activeAppKey, setActiveAppKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const portalContainer = usePortalContainer();

  // Register listener for sources from the main process (once on mount)
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubscribe = api.onScreenShareSources((incomingSources: ElectronScreenSource[]) => {
      useScreenPickerStore.setState({
        isOpen: incomingSources.length > 0,
        sources: incomingSources,
      });
    });
    return unsubscribe;
  }, []);

  // Reset local state when picker opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('screens');
      setActiveAppKey(null);
      setSelectedId(null);
      setSearch('');
    }
  }, [isOpen]);

  const screens = useMemo(() => sources.filter((s) => s.isScreen), [sources]);
  const windows = useMemo(() => sources.filter((s) => !s.isScreen), [sources]);

  const filteredWindows = useMemo(() => {
    if (!search.trim()) return windows;
    const q = search.trim().toLowerCase();
    return windows.filter((w) => w.name.toLowerCase().includes(q));
  }, [windows, search]);

  const apps = useMemo(() => buildApps(windows), [windows]);

  const filteredApps = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.trim().toLowerCase();
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, search]);

  const activeApp = useMemo(
    () => (activeAppKey ? apps.find((a) => a.key === activeAppKey) ?? null : null),
    [apps, activeAppKey],
  );

  const appWindows = useMemo(() => {
    if (!activeApp) return [];
    if (!search.trim()) return activeApp.windows;
    const q = search.trim().toLowerCase();
    return activeApp.windows.filter((w) => w.name.toLowerCase().includes(q));
  }, [activeApp, search]);

  // Auto-select if there's exactly one screen
  useEffect(() => {
    if (isOpen && screens.length === 1 && activeTab === 'screens' && !selectedId) {
      setSelectedId(screens[0]!.id);
    }
  }, [isOpen, screens, activeTab, selectedId]);

  // Auto-select when an application detail view has a single window
  useEffect(() => {
    if (isOpen && activeTab === 'apps' && activeApp && appWindows.length === 1 && !selectedId) {
      setSelectedId(appWindows[0]!.id);
    }
  }, [isOpen, activeTab, activeApp, appWindows, selectedId]);

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setActiveAppKey(null);
    setSelectedId(null);
    setSearch('');
  }, []);

  const enterApp = useCallback((app: AppGroup) => {
    setActiveAppKey(app.key);
    setSelectedId(null);
  }, []);

  const backToApps = useCallback(() => {
    setActiveAppKey(null);
    setSelectedId(null);
  }, []);

  const closePicker = useCallback(() => {
    useScreenPickerStore.setState({ isOpen: false, sources: [] });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedId) return;
    const api = getElectronAPI();
    if (api) {
      api.setScreenSharePendingSelection(
        selectedId,
        useVoiceStore.getState().screenShareConfig.shareAudio,
      );
    }
    useScreenPickerStore.setState({ isOpen: false, sources: [] });
    try {
      const started = await startScreenShare(getCurrentProvider());
      if (started) broadcastVoiceStatus();
    } catch (err) {
      console.error('[Picker] Failed to start screen share:', err);
    }
  }, [selectedId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (activeTab === 'apps' && activeAppKey) {
      backToApps();
    } else {
      closePicker();
    }
  }, [activeTab, activeAppKey, backToApps, closePicker]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const showSourceGrid = activeTab === 'screens' || activeTab === 'windows';
  const inAppDetail = activeTab === 'apps' && activeApp !== null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closePicker} />

      {/* Modal card */}
      <div className="relative w-full max-w-3xl mx-4 glass-modal rounded-lg animate-slide-up flex flex-col max-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-txt-primary">
            {inAppDetail ? activeApp!.name : t('share_your_screen')}
          </h2>
          <button
            onClick={closePicker}
            className="text-txt-tertiary hover:text-txt-primary transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 flex-shrink-0">
          <TabButton
            active={activeTab === 'screens'}
            onClick={() => switchTab('screens')}
            label={t('screens')}
            count={screens.length}
          />
          <TabButton
            active={activeTab === 'windows'}
            onClick={() => switchTab('windows')}
            label={t('windows')}
            count={windows.length}
          />
          <TabButton
            active={activeTab === 'apps'}
            onClick={() => switchTab('apps')}
            label={t('applications')}
            count={apps.length}
          />
        </div>

        {/* Application detail: back row */}
        {inAppDetail && (
          <div className="flex items-center gap-2 px-5 pb-2 flex-shrink-0">
            {activeApp!.icon && (
              <img
                src={activeApp!.icon}
                alt=""
                className="w-5 h-5 flex-shrink-0 rounded"
                draggable={false}
              />
            )}
            <span className="text-[13px] text-txt-secondary truncate">
              {activeApp!.windows.length}{' '}
              {activeApp!.windows.length === 1 ? t('windows').slice(0, -1) : t('windows')}
            </span>
            <button
              onClick={backToApps}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[12px] text-txt-secondary hover:text-txt-primary transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z" />
              </svg>
              {t('back')}
            </button>
          </div>
        )}

        {/* Search (windows tab + application detail) */}
        {(activeTab === 'windows' || inAppDetail) && (
          <div className="px-5 pb-3 flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_windows')}
              className="input-search w-full"
              autoFocus
            />
          </div>
        )}

        {/* Source grid */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-5 py-2 max-h-64">
          {showSourceGrid && (
            <>
              {activeTab === 'screens' && screens.length === 0 && (
                <div className="text-center py-12 text-txt-tertiary text-sm">
                  {t('no_sources_available').replace('{type}', t('screens'))}
                </div>
              )}
              {activeTab === 'windows' &&
                (filteredWindows.length === 0 ? (
                  <div className="text-center py-12 text-txt-tertiary text-sm">
                    {search.trim()
                      ? t('no_windows_match_search')
                      : t('no_sources_available').replace('{type}', t('windows'))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filteredWindows.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        selected={selectedId === source.id}
                        onClick={() => setSelectedId(source.id)}
                        onDoubleClick={() => void handleConfirm()}
                      />
                    ))}
                  </div>
                ))}
              {activeTab === 'screens' && screens.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {screens.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      selected={selectedId === source.id}
                      onClick={() => setSelectedId(source.id)}
                      onDoubleClick={() => void handleConfirm()}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Applications tab */}
          {activeTab === 'apps' && !inAppDetail && (
            <>
              {filteredApps.length === 0 ? (
                <div className="text-center py-12 text-txt-tertiary text-sm">
                  {search.trim() ? t('no_applications_match_search') : t('no_applications_windows')}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredApps.map((app) => (
                    <AppCard
                      key={app.key}
                      app={app}
                      onClick={() => enterApp(app)}
                      onDoubleClick={() => enterApp(app)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Application detail: its windows */}
          {activeTab === 'apps' && inAppDetail && (
            <>
              {appWindows.length === 0 ? (
                <div className="text-center py-12 text-txt-tertiary text-sm">
                  {t('no_windows_match_search')}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {appWindows.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      selected={selectedId === source.id}
                      onClick={() => setSelectedId(source.id)}
                      onDoubleClick={() => void handleConfirm()}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Stream options (resolution / FPS / audio) */}
        <div className="flex-shrink-0 overflow-y-auto scrollbar-thin max-h-72 border-t border-border-hard bg-black/20">
          <ScreenShareSettingsControls />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col items-center px-5 pt-3 pb-4">
          <div className="glass-bubble rounded-full px-3 py-2 flex items-center gap-3">
            <button
              onClick={closePicker}
              className="px-3 py-1 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => void handleConfirm()}
              disabled={!selectedId}
              className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white text-sm font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('share')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer,
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, label, count }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
        active
          ? 'bg-accent-primary text-white'
          : 'bg-white/[0.06] text-txt-secondary hover:text-txt-primary hover:bg-white/[0.1]'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-txt-tertiary'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function SourceCard({ source, selected, onClick, onDoubleClick }: {
  source: ElectronScreenSource;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`group flex flex-col rounded-lg overflow-hidden transition-all text-left border-2 ${
        selected
          ? 'border-accent-primary bg-accent-primary/10'
          : 'border-white/[0.06] hover:border-border-soft bg-surface-base hover:bg-white/[0.04] hover:brightness-110'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/40 overflow-hidden">
        <img
          src={source.thumbnailDataUrl}
          alt={source.name}
          className="w-full h-full object-contain"
          draggable={false}
        />
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 min-w-0">
        {source.appIconDataUrl && (
          <img
            src={source.appIconDataUrl}
            alt=""
            className="w-4 h-4 flex-shrink-0"
            draggable={false}
          />
        )}
        <span className={`text-xs truncate ${selected ? 'text-txt-primary' : 'text-txt-secondary'}`}>
          {source.name}
        </span>
      </div>
    </button>
  );
}

function AppCard({ app, onClick, onDoubleClick }: {
  app: AppGroup;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const first = app.windows[0];
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="group flex flex-col rounded-lg overflow-hidden transition-all text-left border-2 border-white/[0.06] hover:border-border-soft bg-surface-base hover:bg-white/[0.04] hover:brightness-110"
    >
      {/* Cover — first window thumbnail */}
      <div className="relative aspect-video bg-black/40 overflow-hidden">
        {first && (
          <img
            src={first.thumbnailDataUrl}
            alt={app.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        )}
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/70 text-[10px] text-white/90">
          {app.windows.length}
        </span>
      </div>

      {/* App identity */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 min-w-0">
        {app.icon ? (
          <img
            src={app.icon}
            alt=""
            className="w-4 h-4 flex-shrink-0 rounded"
            draggable={false}
          />
        ) : (
          <div className="w-4 h-4 flex-shrink-0 rounded bg-surface-elevated flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary">
              <path d="M6 16h12v2H6zm0-5h12v2H6zm0-5h12v2H6z" />
            </svg>
          </div>
        )}
        <span className="text-xs text-txt-secondary truncate group-hover:text-txt-primary transition-colors">
          {app.name}
        </span>
      </div>
    </button>
  );
}