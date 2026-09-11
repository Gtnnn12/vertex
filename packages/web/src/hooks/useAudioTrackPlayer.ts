import { useRef, useEffect } from 'react';
import { AudioManager } from '../audio/AudioManager';

interface UseAudioTrackPlayerOptions {
  track: MediaStreamTrack | null;
  volume: number;  // final computed value, 0.0 – 4.0+
  muted: boolean;  // deafen, stream mute, etc.
}

/**
 * Hybrid audio pipeline for a single remote audio track.
 *
 * Architecture:
 *   1. A MUTED <audio> element keeps Chrome's WebRTC audio pipeline alive
 *      for the track. Chrome requires an HTML media element consuming a
 *      WebRTC MediaStreamTrack or it stops processing it. The element is
 *      always muted (volume=0, muted=true) — it never produces audible output.
 *
 *   2. A Web Audio pipeline handles ALL actual audio output:
 *      MediaStreamTrack -> MediaStream -> MediaStreamAudioSourceNode -> GainNode -> ctx.destination
 *
 * This gives us:
 *   - Chrome compatibility (muted <audio> keep-alive)
 *   - No ducking (all elements are muted, only Web Audio produces sound)
 *   - Clean mixing (single ctx.destination for all tracks)
 *   - Full volume range (0.0 – 4.0+) via GainNode
 *   - Smooth transitions via setTargetAtTime (no clicks/pops)
 */
export function useAudioTrackPlayer(
  opts: UseAudioTrackPlayerOptions,
): React.RefObject<HTMLAudioElement> {
  const { track, volume, muted } = opts;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Keep current volume/muted in refs so Effect 1 can read them
  // for the initial ramp without depending on them
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  volumeRef.current = volume;
  mutedRef.current = muted;

  // Effect 1: Track attachment (keep-alive) + Web Audio pipeline build
  useEffect(() => {
    console.log('[VERTEX useAudioTrackPlayer] Effect 1 triggered, track:', track?.id ?? 'null', 'kind:', track?.kind ?? 'n/a', 'readyState:', track?.readyState ?? 'n/a');
    const audioEl = audioRef.current;

    // Tear down previous Web Audio graph
    if (sourceRef.current) {
      console.log('[VERTEX useAudioTrackPlayer]   tearing down previous source node');
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (gainRef.current) {
      console.log('[VERTEX useAudioTrackPlayer]   tearing down previous gain node');
      gainRef.current.disconnect();
      gainRef.current = null;
    }

    if (!track) {
      console.log('[VERTEX useAudioTrackPlayer]   no track, clearing audioEl.srcObject');
      if (audioEl) audioEl.srcObject = null;
      return;
    }

    // --- Keep-alive: attach track to <audio> element (always muted) ---
    // Chrome needs an HTML element consuming the WebRTC track or it
    // stops the audio pipeline for that track entirely.
    console.log('[VERTEX useAudioTrackPlayer]   setting up keep-alive <audio> element');
    if (audioEl) {
      const stream = new MediaStream([track]);
      console.log('[VERTEX useAudioTrackPlayer]   MediaStream created, id:', stream.id, 'active:', stream.active, 'tracks:', stream.getTracks().length);
      audioEl.srcObject = stream;
      audioEl.muted = true;
      audioEl.volume = 0;
      console.log('[VERTEX useAudioTrackPlayer]   audioEl.srcObject set, calling play()');
      audioEl.play().then(() => console.log('[VERTEX useAudioTrackPlayer]   audioEl.play() succeeded')).catch((e) => console.log('[VERTEX useAudioTrackPlayer]   audioEl.play() failed:', e));
    }

    // --- Web Audio pipeline for actual output ---
    console.log('[VERTEX useAudioTrackPlayer]   getting AudioContext');
    const ctx = AudioManager.getInstance().ensureContext();
    console.log('[VERTEX useAudioTrackPlayer]   AudioContext state:', ctx.state, 'sampleRate:', ctx.sampleRate);

    const audioStream = new MediaStream([track]);
    console.log('[VERTEX useAudioTrackPlayer]   MediaStream for WebAudio, id:', audioStream.id, 'active:', audioStream.active);
    const source = ctx.createMediaStreamSource(audioStream);
    console.log('[VERTEX useAudioTrackPlayer]   MediaStreamAudioSourceNode created');
    const gain = ctx.createGain();
    console.log('[VERTEX useAudioTrackPlayer]   GainNode created');

    // Start gain at 0 to prevent pop, then ramp to target
    gain.gain.setValueAtTime(0, ctx.currentTime);
    const targetGain = mutedRef.current ? 0 : volumeRef.current;
    gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.015);
    console.log('[VERTEX useAudioTrackPlayer]   gain set to', targetGain, '(muted:', mutedRef.current, ')');

    source.connect(gain);
    const masterOutput = AudioManager.getInstance().getMasterOutput();
    gain.connect(masterOutput);
    console.log('[VERTEX useAudioTrackPlayer]   connected source -> gain -> masterOutput');

    sourceRef.current = source;
    gainRef.current = gain;

    // Resume AudioContext if suspended
    if (ctx.state === 'suspended') {
      console.log('[VERTEX useAudioTrackPlayer]   AudioContext is suspended, attempting resume()');
      ctx.resume().then(() => {
        console.log('[VERTEX useAudioTrackPlayer]   AudioContext.resume() succeeded, state:', ctx.state);
      }).catch((e) => {
        console.log('[VERTEX useAudioTrackPlayer]   AudioContext.resume() failed:', e);
      });
    } else {
      console.log('[VERTEX useAudioTrackPlayer]   AudioContext state is:', ctx.state, '- no resume needed');
    }

    return () => {
      console.log('[VERTEX useAudioTrackPlayer]   cleanup - disconnecting nodes');
      source.disconnect();
      gain.disconnect();
      sourceRef.current = null;
      gainRef.current = null;
    };
  }, [track]);

  // Effect 2: Update gain when volume or muted changes (no graph rebuild)
  useEffect(() => {
    if (!gainRef.current) return;

    const ctx = AudioManager.getInstance().ensureContext();
    const targetGain = muted ? 0 : volume;
    gainRef.current.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.015);
  }, [volume, muted]);

  return audioRef;
}
