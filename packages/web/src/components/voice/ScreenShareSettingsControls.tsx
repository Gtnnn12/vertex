import React, { useEffect } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import type { ScreenShareConfig } from '../../stores/voiceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { buildScreenShareOptions } from '../../utils/screenShare';
import { Toggle } from '../ui/Toggle';
import { isElectron } from '../../platform/platform';
import { RESOLUTION_LABELS } from '@backspace/shared/src/constants';
import { useLanguage } from '../../contexts/LanguageContext';

const MODES: { value: ScreenShareConfig['mode'] }[] = [
  { value: 'gaming' },
  { value: 'text' },
];

const CODEC_OPTIONS = [
  { value: 'vp9' as const, sub: 'VP9' },
  { value: 'hw' as const, sub: 'H.264' },
];

function formatBitrate(bps: number): string {
  return `${(bps / 1_000_000).toFixed(bps % 1_000_000 === 0 ? 0 : 1)} Mbps`;
}

function formatDegradation(pref: RTCDegradationPreference, t: (key: string) => string): string {
  switch (pref) {
    case 'maintain-resolution': return t('hold_resolution');
    case 'maintain-framerate': return t('hold_framerate');
    case 'balanced': return t('balanced');
    default: return pref;
  }
}

function formatKbps(kbps: number): string {
  return kbps >= 1000
    ? `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)} Mbps`
    : `${kbps} kbps`;
}

/**
 * Reusable stream-quality controls (resolution, FPS, content mode, codec,
 * bitrate, system audio). Shared by the Electron ScreenSharePicker and any
 * inline surface; reads/writes voiceStore.screenShareConfig directly.
 */
export function ScreenShareSettingsControls() {
  const { t } = useLanguage();
  const config = useVoiceStore((s) => s.screenShareConfig);
  const setConfig = useVoiceStore((s) => s.setScreenShareConfig);
  const hwOverdrive = useVoiceStore((s) => s.hwOverdrive);
  const setHwOverdrive = useVoiceStore((s) => s.setHwOverdrive);
  const limits = useSettingsStore((s) => s.streamingLimits);

  const BITRATE_MIN = limits?.minBitrateKbps ?? 500;
  const BITRATE_MAX = limits?.maxBitrateKbps ?? 20000;
  const BITRATE_STEP = limits?.bitrateStepKbps ?? 500;

  const RESOLUTIONS = (limits?.allowedResolutions ?? [720, 1080, 1440, 2160]).map((r) => ({
    value: r as ScreenShareConfig['height'],
    label: RESOLUTION_LABELS[r as keyof typeof RESOLUTION_LABELS] ?? `${r}p`,
  }));
  const FRAME_RATES = (limits?.allowedFramerates ?? [30, 60]).map((f) => ({
    value: f as ScreenShareConfig['fps'],
    label: `${f}`,
  }));
  const resGridCols = RESOLUTIONS.length >= 4 ? 'grid-cols-4' : RESOLUTIONS.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const fpsGridCols = FRAME_RATES.length >= 3 ? 'grid-cols-3' : 'grid-cols-2';

  // Auto-clamp persisted config if outside allowed bounds
  useEffect(() => {
    if (!limits) return;
    const patch: Partial<ScreenShareConfig> = {};
    if (!limits.allowedResolutions.includes(config.height)) {
      const numericRes = limits.allowedResolutions.filter((r): r is number => r !== 'native');
      if (typeof config.height === 'number' && numericRes.length > 0) {
        const h = config.height;
        patch.height = numericRes.reduce((a, b) =>
          Math.abs(b - h) < Math.abs(a - h) ? b : a
        );
      } else {
        // 'native' was disabled or no numeric options — fall back to highest numeric
        patch.height = numericRes.length > 0 ? Math.max(...numericRes) : 1080;
      }
    }
    if (!limits.allowedFramerates.includes(config.fps)) {
      const f = config.fps;
      const closest = limits.allowedFramerates.reduce((a, b) =>
        Math.abs(b - f) < Math.abs(a - f) ? b : a
      );
      patch.fps = closest;
    }
    if (config.customBitrateKbps != null) {
      const clamped = Math.min(Math.max(config.customBitrateKbps, limits.minBitrateKbps), limits.maxBitrateKbps);
      if (clamped !== config.customBitrateKbps) patch.customBitrateKbps = clamped;
    }
    if (Object.keys(patch).length > 0) setConfig(patch);
  }, [limits, config, setConfig]);

  const result = buildScreenShareOptions(config);

  const pillBase = 'px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer select-none text-center';
  const pillSelected = 'bg-accent-primary text-white';
  const pillUnselected = 'bg-surface-elevated text-txt-secondary hover:bg-interactive-hover';

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-border-hard">
        <span className="text-[14px] font-bold text-txt-primary">{t('stream_settings')}</span>
      </div>

      <div className="px-3 py-3 flex flex-col gap-3">
        {/* Resolution */}
        <div>
          <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider mb-1.5">
            {t('resolution')}
          </div>
          <div className={`grid ${resGridCols} gap-1.5`}>
            {RESOLUTIONS.map((r) => (
              <button
                key={String(r.value)}
                onClick={() => setConfig({ height: r.value })}
                className={`${pillBase} ${config.height === r.value ? pillSelected : pillUnselected}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate */}
        <div>
          <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider mb-1.5">
            {t('frame_rate')}
          </div>
          <div className={`grid ${fpsGridCols} gap-1.5`}>
            {FRAME_RATES.map((f) => (
              <button
                key={f.value}
                onClick={() => setConfig({ fps: f.value })}
                className={`${pillBase} ${config.fps === f.value ? pillSelected : pillUnselected}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Mode */}
        <div>
          <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider mb-1.5">
            {t('content_mode')}
          </div>
          <div className="flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setConfig({ mode: m.value })}
                className={`${pillBase} ${config.mode === m.value ? pillSelected : pillUnselected}`}
              >
                {t(m.value === 'gaming' ? 'gaming' : 'text')}
              </button>
            ))}
          </div>
        </div>

        {/* Codec */}
        <div>
          <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider mb-1.5">
            {t('codec')}
          </div>
          <div className="flex gap-1.5">
            {CODEC_OPTIONS.map((c) => {
              const isHw = c.value === 'hw';
              const isSelected = isHw ? hwOverdrive : !hwOverdrive;
              return (
                <button
                  key={c.value}
                  onClick={() => setHwOverdrive(isHw)}
                  className={`${pillBase} flex flex-col items-center gap-0 leading-tight ${
                    isSelected
                      ? (isHw ? 'bg-accent-amber/60 text-white' : pillSelected)
                      : (isHw ? 'bg-surface-elevated/50 text-txt-tertiary hover:bg-interactive-hover' : pillUnselected)
                  }`}
                >
                  <span>{t(isHw ? 'codec_nvidia_apple' : 'codec_standard')}</span>
                  <span className="text-[10px] opacity-60">{c.sub}</span>
                </button>
              );
            })}
          </div>
          {hwOverdrive && (
            <div className="text-[10px] text-accent-amber/80 mt-1">
              {t('gpu_encoder_note')}
            </div>
          )}
        </div>

        {/* Bitrate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider">
              {t('bitrate')}
            </div>
            {limits?.allowCustomBitrate !== false && config.customBitrateKbps != null && (
              <button
                onClick={() => setConfig({ customBitrateKbps: null })}
                className="text-[11px] text-accent-primary hover:text-accent-lavender font-medium transition-colors"
              >
                {t('reset_to_auto')}
              </button>
            )}
          </div>
          {limits?.allowCustomBitrate !== false ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={BITRATE_MIN}
                max={BITRATE_MAX}
                step={BITRATE_STEP}
                value={config.customBitrateKbps ?? Math.round(result.publish.videoEncoding.maxBitrate / 1000)}
                onChange={(e) => setConfig({ customBitrateKbps: Number(e.target.value) })}
                className="flex-1 h-1.5 accent-accent-primary cursor-pointer appearance-none bg-interactive-muted rounded-full
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0
                  [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <span className={`text-[12px] font-medium min-w-[64px] text-right ${
                config.customBitrateKbps != null ? 'text-txt-primary' : 'text-txt-tertiary'
              }`}>
                {config.customBitrateKbps != null
                  ? formatKbps(config.customBitrateKbps)
                  : t('auto')}
              </span>
            </div>
          ) : (
            <div>
              <div className="text-[12px] text-txt-secondary font-medium">
                {formatKbps(Math.round(result.publish.videoEncoding.maxBitrate / 1000))}
              </div>
              <div className="text-[10px] text-txt-tertiary mt-0.5">
                {t('custom_bitrate_disabled')}
              </div>
            </div>
          )}
        </div>

        {/* System Audio */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-txt-tertiary font-semibold uppercase tracking-wider">
                {t('system_audio')}
              </div>
              {isElectron() && config.shareAudio && (
                <div className="text-[10px] text-accent-amber/80 mt-0.5">
                  {t('use_chrome_echo_free')}
                </div>
              )}
            </div>
            <Toggle
              enabled={config.shareAudio}
              onChange={(enabled) => setConfig({ shareAudio: enabled })}
            />
          </div>
        </div>
      </div>

      {/* Footer — computed stats */}
      <div className="px-3 py-2 border-t border-border-hard">
        <span className="text-[12px] text-txt-tertiary">
          {formatBitrate(result.publish.videoEncoding.maxBitrate)} · {formatDegradation(result.overdrive.degradationPreference, t)}
        </span>
      </div>
    </div>
  );
}