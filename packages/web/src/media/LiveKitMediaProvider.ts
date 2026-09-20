import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  RemoteAudioTrack,
  ConnectionState as LKConnectionState,
  LocalAudioTrack,
  LocalTrackPublication,
  DisconnectReason,
} from 'livekit-client';
import type {
  MediaProvider,
  MediaProviderOptions,
  PublishOptions,
  VideoOptions,
  DataPublishOptions,
  MediaProviderEvent,
  MediaEventHandler,
  TrackSource,
} from './MediaProvider';

let _activeRoom: Room | null = null;
let _instance: LiveKitMediaProvider | null = null;
let _connectGeneration = 0;

export function getActiveRoom(): Room | null {
  return _activeRoom;
}

export function _setActiveRoom(room: Room | null): void {
  _activeRoom = room;
}

function mapConnectionState(lkState: LKConnectionState): import('./MediaProvider').ConnectionState {
  switch (lkState) {
    case LKConnectionState.Connected: return 'connected';
    case LKConnectionState.Connecting: return 'connecting';
    case LKConnectionState.Reconnecting: return 'reconnecting';
    case LKConnectionState.Disconnected: return 'disconnected';
    default: return 'disconnected';
  }
}

export class LiveKitMediaProvider implements MediaProvider {
  readonly providerName = 'livekit';
  private _room: Room | null = null;
  private _roomName: string | null = null;
  private _handlers: Map<MediaProviderEvent, Set<MediaEventHandler>> = new Map();
  private _lkConnectionState: LKConnectionState = LKConnectionState.Disconnected;

  get roomName(): string | null {
    return this._roomName;
  }

  async connect(
    url: string,
    token: string,
    options?: MediaProviderOptions,
    handlers?: {
      onRoomReady?: (room: Room) => void;
    }
  ): Promise<void> {
    _connectGeneration++;
    const connectGen = _connectGeneration;

    if (this._room) {
      await this._room.disconnect();
      this._room = null;
      _activeRoom = null;
    }

    const room = new Room({
      adaptiveStream: options?.adaptiveStream ?? true,
      dynacast: options?.dynacast ?? true,
      publishDefaults: {
        videoCodec: options?.publishDefaults?.videoCodec ?? 'h264',
        simulcast: options?.publishDefaults?.simulcast ?? true,
      },
    });

    this._room = room;
    _activeRoom = room;
    this._roomName = room.name;

    this._attachLkHandlers();

    handlers?.onRoomReady?.(room);

    await room.connect(url, token, { autoSubscribe: false });

    if (connectGen !== _connectGeneration) {
      await room.disconnect();
      this._room = null;
      _activeRoom = null;
      this._roomName = null;
      return;
    }
  }

  async disconnect(): Promise<void> {
    _connectGeneration++;
    if (this._room) {
      await this._room.disconnect();
      this._room = null;
      _activeRoom = null;
      this._roomName = null;
      this._lkConnectionState = LKConnectionState.Disconnected;
    }
  }

  async publishTrack(source: TrackSource, track: MediaStreamTrack, options?: PublishOptions): Promise<void> {
    if (!this._room) throw new Error('Not connected');

    const lkSource = this._sourceToLk(source);
    if (!lkSource) throw new Error(`Unknown track source: ${source}`);

    await this._room.localParticipant.publishTrack(track as any, {
      name: options?.name ?? source,
      source: lkSource,
      ...(options?.videoCodec ? { videoCodec: options.videoCodec } : {}),
      ...(options?.videoEncoding ? { videoEncoding: options.videoEncoding } : {}),
      ...(options?.simulcast !== undefined ? { simulcast: options.simulcast } : {}),
    } as any);
  }

  async unpublishTrack(source: TrackSource): Promise<void> {
    if (!this._room) throw new Error('Not connected');

    const lkSource = this._sourceToLk(source);
    if (!lkSource) return;

    const pub = this._room.localParticipant.getTrackPublications().find(p => p.source === lkSource);
    if (pub?.track) {
      await this._room.localParticipant.unpublishTrack(pub.track as LocalAudioTrack);
    }
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this._room) throw new Error('Not connected');
    await this._room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCameraEnabled(enabled: boolean, options?: VideoOptions): Promise<void> {
    if (!this._room) throw new Error('Not connected');

    const captureOpts: any = {};
    if (options?.deviceId) captureOpts.deviceId = options.deviceId;
    if (options?.resolution) captureOpts.resolution = options.resolution;
    if (options?.frameRate) captureOpts.frameRate = options.frameRate;

    await this._room.localParticipant.setCameraEnabled(enabled, captureOpts);
  }

  async setScreenShareEnabled(enabled: boolean, options?: PublishOptions): Promise<void> {
    if (!this._room) throw new Error('Not connected');

    if (enabled) {
      const captureOpts: any = {};
      if (options?.videoEncoding) {
        captureOpts.frameRate = options.videoEncoding.maxFramerate;
      }

      await this._room.localParticipant.setScreenShareEnabled(true, captureOpts, {
        videoCodec: options?.videoCodec ?? 'vp9',
        videoEncoding: options?.videoEncoding,
        screenShareEncoding: options?.screenShareEncoding,
        simulcast: options?.simulcast ?? false,
      } as any);
    } else {
      await this._room.localParticipant.setScreenShareEnabled(false);
    }
  }

  async publishData(data: Uint8Array, options?: DataPublishOptions): Promise<void> {
    if (!this._room) throw new Error('Not connected');
    await this._room.localParticipant.publishData(data, {
      reliable: options?.reliable ?? true,
    } as any);
  }

  getParticipants(): unknown[] {
    if (!this._room) return [];
    return Array.from(this._room.remoteParticipants.values());
  }

  getConnectionState(): import('./MediaProvider').ConnectionState {
    return mapConnectionState(this._lkConnectionState);
  }

  isConnected(): boolean {
    return this._lkConnectionState === LKConnectionState.Connected;
  }

  async setTrackSubscribed(participantIdentity: string, source: TrackSource, subscribed: boolean): Promise<void> {
    if (!this._room) return;
    const rp = this._room.remoteParticipants.get(participantIdentity);
    if (!rp) return;
    const lkSource = this._sourceToLk(source);
    if (!lkSource) return;
    const pub = rp.trackPublications.get(lkSource);
    if (!pub) return;
    (pub as any).setSubscribed(subscribed);
  }

  async setParticipantVolume(participantIdentity: string, volume: number): Promise<void> {
    if (!this._room) return;
    const rp = this._room.remoteParticipants.get(participantIdentity);
    if (!rp) return;
    const normalized = Math.max(0, Math.min(1, volume / 200));
    (rp as any).setVolume(normalized);
  }

  on(event: MediaProviderEvent, handler: MediaEventHandler): void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler);
  }

  off(event: MediaProviderEvent, handler: MediaEventHandler): void {
    this._handlers.get(event)?.delete(handler);
  }

  async switchActiveDevice(kind: 'audioinput' | 'audiooutput' | 'videoinput', deviceId: string): Promise<void> {
    if (!this._room) return;
    await this._room.switchActiveDevice(kind, deviceId);
  }

  private _emit(event: MediaProviderEvent, ...args: unknown[]): void {
    this._handlers.get(event)?.forEach(h => {
      try { h(...args); } catch { }
    });
  }

  private _sourceToLk(source: TrackSource): Track.Source | null {
    switch (source) {
      case 'microphone': return Track.Source.Microphone;
      case 'camera': return Track.Source.Camera;
      case 'screen_share': return Track.Source.ScreenShare;
      case 'screen_share_audio': return Track.Source.ScreenShareAudio;
      default: return null;
    }
  }

  private _attachLkHandlers(): void {
    const room = this._room;
    if (!room) return;

    room.on(RoomEvent.ParticipantConnected, (p: Participant) => {
      this._emit('participant_connected', p);
    });

    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      this._emit('participant_disconnected', p);
    });

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        (track as RemoteAudioTrack).detach();
      }
      this._emit('track_subscribed', track, pub, participant);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        (track as RemoteAudioTrack).detach();
      }
      this._emit('track_unsubscribed', track, pub, participant);
    });

    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      this._emit('track_muted', pub, participant);
    });

    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      this._emit('track_unmuted', pub, participant);
    });

    room.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      this._emit('track_published', pub);
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      this._emit('track_unpublished', pub);
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      this._emit('data_received', payload, participant);
    });

    room.on(RoomEvent.ConnectionStateChanged, (state: LKConnectionState) => {
      this._lkConnectionState = state;
      this._emit('connection_state_changed', mapConnectionState(state));
    });

    room.on(RoomEvent.ConnectionQualityChanged, (quality: any, participant: Participant) => {
      this._emit('connection_quality_changed', quality, participant);
    });

    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this._emit('disconnected', reason);
    });
  }
}

export function getLiveKitProvider(): LiveKitMediaProvider {
  if (!_instance) {
    _instance = new LiveKitMediaProvider();
  }
  return _instance;
}
