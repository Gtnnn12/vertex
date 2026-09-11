export type TrackSource = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface MediaProviderOptions {
  adaptiveStream?: boolean;
  dynacast?: boolean;
  publishDefaults?: {
    videoCodec?: 'h264' | 'vp9';
    simulcast?: boolean;
  };
}

export interface PublishOptions {
  name?: string;
  source?: TrackSource;
  videoCodec?: 'h264' | 'vp9';
  videoEncoding?: {
    maxBitrate: number;
    maxFramerate: number;
  };
  screenShareEncoding?: {
    maxBitrate: number;
    maxFramerate: number;
  };
  simulcast?: boolean;
}

export interface VideoOptions {
  deviceId?: string;
  resolution?: { width: number; height: number };
  frameRate?: number;
}

export interface DataPublishOptions {
  reliable?: boolean;
}

export type MediaProviderEvent =
  | 'participant_connected'
  | 'participant_disconnected'
  | 'track_subscribed'
  | 'track_unsubscribed'
  | 'track_muted'
  | 'track_unmuted'
  | 'track_published'
  | 'track_unpublished'
  | 'data_received'
  | 'connection_state_changed'
  | 'connection_quality_changed'
  | 'disconnected'
  | 'camera_track_changed';

export type MediaEventHandler = (...args: unknown[]) => void;

export interface MediaProvider {
  readonly providerName: string;
  readonly roomName: string | null;

  connect(url: string, token: string, options?: MediaProviderOptions): Promise<void>;
  disconnect(): Promise<void>;

  publishTrack(source: TrackSource, track: MediaStreamTrack, options?: PublishOptions): Promise<void>;
  unpublishTrack(source: TrackSource): Promise<void>;

  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean, options?: VideoOptions): Promise<void>;
  setScreenShareEnabled(enabled: boolean, options?: PublishOptions): Promise<void>;

  publishData(data: Uint8Array, options?: DataPublishOptions): Promise<void>;

  getParticipants(): unknown[];
  getConnectionState(): ConnectionState;
  isConnected(): boolean;

  setTrackSubscribed(participantIdentity: string, source: TrackSource, subscribed: boolean): Promise<void>;
  setParticipantVolume(participantIdentity: string, volume: number): Promise<void>;

  on(event: MediaProviderEvent, handler: MediaEventHandler): void;
  off(event: MediaProviderEvent, handler: MediaEventHandler): void;

  switchActiveDevice(kind: 'audioinput' | 'audiooutput' | 'videoinput', deviceId: string): Promise<void>;
}

export function isMediaProvider(obj: unknown): obj is MediaProvider {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'providerName' in obj &&
    'connect' in obj &&
    'disconnect' in obj
  );
}
