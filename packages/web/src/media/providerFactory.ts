import { getLiveKitProvider, LiveKitMediaProvider } from './LiveKitMediaProvider';
import type { MediaProvider } from './MediaProvider';

export type ProviderType = 'livekit';

let _currentProviderType: ProviderType = 'livekit';
let _currentProvider: MediaProvider | null = null;

export function getProvider(type: ProviderType): MediaProvider {
  return getLiveKitProvider();
}

export function getCurrentProvider(): MediaProvider {
  return _currentProvider ?? getLiveKitProvider();
}

export function setCurrentProvider(provider: MediaProvider): void {
  _currentProvider = provider;
  if (provider instanceof LiveKitMediaProvider) {
    _currentProviderType = 'livekit';
  }
}

export function getCurrentProviderType(): ProviderType {
  return _currentProviderType;
}

export function clearCurrentProvider(): void {
  _currentProvider = null;
  _currentProviderType = 'livekit';
}

export function isLiveKitProvider(provider: MediaProvider | null): boolean {
  return provider?.providerName === 'livekit';
}
