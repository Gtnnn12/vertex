import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { useInstanceStore } from '../../../stores/instanceStore';
import { useSpaceStore } from '../../../stores/spaceStore';
import { Avatar } from '../../ui/Avatar';
import { ImageCropModal } from '../../ui/ImageCropModal';
import { ProfileIdentityCard } from '../../ui/ProfileIdentityCard';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { api } from '../../../api/client';
import { useTransferStore } from '../../../stores/transferStore';
import { waitForTransferAttachment } from '../../../utils/waitForTransfer';
import { isAnimatedGif } from '../../../utils/isAnimatedGif';
import { getAvatarGradient, adjustColor, mutedGradient, AVATAR_GRADIENT_MAP, BANNER_COLOR_PRESETS } from '../../../utils/gradients';
import { AVATAR_COLORS } from '@backspace/shared';
import type { User, UserStatus, AvatarColor } from '@backspace/shared';
import type { FederationOpResult } from '../../../utils/federationOps';
import { useLanguage } from '../../../contexts/LanguageContext';
import { SettingsCard } from './_shared/SettingsCard';

export function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? '');
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'online');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [accentColor, setAccentColor] = useState<string | null>(user?.accentColor ?? null);
  const [avatarColorState, setAvatarColorState] = useState<AvatarColor | null>(user?.avatarColor ?? null);
  const [customHex, setCustomHex] = useState(user?.accentColor ?? '');

  // Avatar upload state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFilename, setAvatarFilename] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Banner upload state
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFilename, setBannerFilename] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop visual state
  const [avatarDragActive, setAvatarDragActive] = useState(false);
  const [bannerDragActive, setBannerDragActive] = useState(false);

  const addToast = useUIStore((s) => s.addToast);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setCustomStatus(user.customStatus ?? '');
      setStatus(user.status ?? 'online');
      setBio(user.bio ?? '');
      setAccentColor(user.accentColor ?? null);
      setAvatarColorState(user.avatarColor ?? null);
      setCustomHex(user.accentColor ?? '');
      // Reset upload state
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setAvatarPreview(null);
      setAvatarFilename(null);
      setBannerPreview(null);
      setBannerFilename(null);
    }
  }, [user?.displayName, user?.customStatus, user?.status, user?.bio, user?.accentColor, user?.avatarColor, user?.avatar, user?.banner]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordResults, setPasswordResults] = useState<FederationOpResult[] | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const instances = useInstanceStore((s) => s.instances);
  const changePassword = useAuthStore((s) => s.changePassword);

  // ── Detached-account re-attach (fallback path, re-attach spec §3.4) ──
  // Explicit action shown only when this client also holds an active connection
  // to the account's home domain. Two-step armed confirm names both identities
  // before minting the proof. The primary/automatic path lives in instanceStore.
  const [reattachArmed, setReattachArmed] = useState(false);
  const [reattaching, setReattaching] = useState(false);
  const [reattachError, setReattachError] = useState<string | null>(null);

  const homeConnection = useMemo(() => {
    if (!user?.homeInstance) return null;
    const homeDomain = user.homeInstance.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    return instances.find(
      (i) => i.status === 'connected'
        // Portless hostname — must agree with the server's extractDomain
        // (new URL(origin).hostname) so a ported home instance still matches.
        && new URL(i.origin).hostname.toLowerCase() === homeDomain,
    ) ?? null;
  }, [instances, user?.homeInstance]);

  const handleReattach = async () => {
    if (!homeConnection) return;
    if (!reattachArmed) {
      setReattachArmed(true);
      return;
    }
    setReattaching(true);
    setReattachError(null);
    try {
      // Target domain = THIS instance (where the detached account lives).
      // Portless hostname to match the server's extractDomain contract.
      const { token } = await homeConnection.api.auth.attachProof(window.location.hostname);
      const res = await api.users.reattach({ token });
      useAuthStore.getState().setUser(res.user);
      // Re-attach reconciled this (home) account's 1-on-1 DM federatedIds on the
      // server; refetch the home DM list so the split conversation collapses
      // without a reload.
      try { await useSpaceStore.getState().reloadDmsForOrigin(''); } catch { /* non-fatal */ }
      addToast(`${t('account_relinked_with')} ${homeConnection.username}`, 'success', 3000);
    } catch (err) {
      setReattachError(err instanceof Error ? err.message : t('reattach_failed'));
    } finally {
      setReattaching(false);
      setReattachArmed(false);
    }
  };

  if (!user) return null;

  const effectiveDisplayName = displayName.trim() || user.username;
  const effectiveAccent = accentColor;
  const effectiveAvatarColor = avatarColorState;

  // Change detection
  const hasChanges =
    displayName !== (user.displayName ?? '') ||
    customStatus !== (user.customStatus ?? '') ||
    status !== (user.status ?? 'online') ||
    bio !== (user.bio ?? '') ||
    accentColor !== (user.accentColor ?? null) ||
    avatarColorState !== (user.avatarColor ?? null) ||
    avatarFilename !== null ||
    bannerFilename !== null;

  // Compute banner display
  const currentBannerUrl = user.banner
    ? (user.banner.startsWith('http') ? user.banner : api.uploads.url(user.banner))
    : null;
  const displayBannerSrc = bannerPreview ?? (bannerFilename === '' ? null : currentBannerUrl);

  // Compute avatar display
  const currentAvatarSrc = user.avatar
    ? (user.avatar.startsWith('http') ? user.avatar : api.uploads.url(user.avatar))
    : null;
  const displayAvatarSrc = avatarPreview ?? (avatarFilename === '' ? null : currentAvatarSrc);

  // ── File selection handlers ──
  //
  // Animated GIFs bypass the crop modal entirely: the canvas crop in
  // cropImage.ts would draw only the first frame and re-export it as a static
  // WebP, destroying the animation. Instead we keep the original File and
  // upload its bytes verbatim so every frame is preserved. Static images keep
  // the existing crop flow. Both the file inputs and the drag & drop zones
  // funnel into the same process*File helpers.
  const processAvatarFile = async (file: File) => {
    if (await isAnimatedGif(file)) {
      // Animated GIF: upload immediately (bypasses canvas crop, preserving
      // frames) and show a live preview of the original file.
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
      setAvatarCropSrc(null);
      setUploadingAvatar(true);
      try {
        const tid = await useTransferStore.getState().startUpload(file, { tray: false });
        const { filename } = await waitForTransferAttachment(tid);
        setAvatarFilename(filename);
      } catch {
        setError(t('failed_to_upload_avatar'));
        setAvatarPreview(null);
        setAvatarFilename(null);
        URL.revokeObjectURL(previewUrl);
      } finally {
        setUploadingAvatar(false);
      }
    } else {
      setAvatarFilename(null);
      const reader = new FileReader();
      reader.onload = () => setAvatarCropSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const processBannerFile = async (file: File) => {
    if (await isAnimatedGif(file)) {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      const previewUrl = URL.createObjectURL(file);
      setBannerPreview(previewUrl);
      setBannerCropSrc(null);
      setUploadingBanner(true);
      try {
        const tid = await useTransferStore.getState().startUpload(file, { tray: false });
        const { filename } = await waitForTransferAttachment(tid);
        setBannerFilename(filename);
      } catch {
        setError(t('failed_to_upload_banner'));
        setBannerPreview(null);
        setBannerFilename(null);
        URL.revokeObjectURL(previewUrl);
      } finally {
        setUploadingBanner(false);
      }
    } else {
      setBannerFilename(null);
      const reader = new FileReader();
      reader.onload = () => setBannerCropSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAvatarFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processBannerFile(file);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleAvatarDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setAvatarDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processAvatarFile(file);
  };

  const handleBannerDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setBannerDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processBannerFile(file);
  };

  // ── Crop complete handlers ──
  const handleAvatarCropComplete = async (blob: Blob) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    const previewUrl = URL.createObjectURL(blob);
    setAvatarPreview(previewUrl);
    setAvatarCropSrc(null);
    const file = new File([blob], 'avatar.webp', { type: blob.type || 'image/webp' });
    setUploadingAvatar(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setAvatarFilename(filename);
    } catch {
      setError(t('failed_to_upload_avatar'));
      setAvatarPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerCropComplete = async (blob: Blob) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    const previewUrl = URL.createObjectURL(blob);
    setBannerPreview(previewUrl);
    setBannerCropSrc(null);
    const file = new File([blob], 'banner.webp', { type: blob.type || 'image/webp' });
    setUploadingBanner(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setBannerFilename(filename);
    } catch {
      setError(t('failed_to_upload_banner'));
      setBannerPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarFilename('');
  };

  const handleRemoveBanner = () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
    setBannerFilename('');
  };

  const handleSave = async () => {
    setError('');
    setIsLoading(true);
    try {
      const updates: Record<string, string | undefined> = {};
      if (displayName !== (user.displayName ?? '')) updates.displayName = displayName.trim();
      if (customStatus !== (user.customStatus ?? '')) updates.customStatus = customStatus.trim();
      if (status !== (user.status ?? 'online')) updates.status = status;
      if (bio !== (user.bio ?? '')) updates.bio = bio.trim();
      if (accentColor !== (user.accentColor ?? null)) updates.accentColor = accentColor ?? '';
      if (avatarColorState !== (user.avatarColor ?? null)) updates.avatarColor = avatarColorState ?? '';
      if (avatarFilename !== null) updates.avatar = avatarFilename;
      if (bannerFilename !== null) updates.banner = bannerFilename;

      await updateProfile(updates as Parameters<typeof updateProfile>[0]);
      addToast(t('profile_updated'), 'success', 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_to_update_profile'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordResults(null);

    if (newPassword.length < 8) {
      setPasswordError(t('password_min_length_error'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('passwords_do_not_match'));
      return;
    }

    setPasswordLoading(true);
    try {
      const results = await changePassword(currentPassword, newPassword);
      addToast(t('password_changed'), 'success', 2000);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');

      if (results.length > 0) {
        setPasswordResults(results);
      }

      setTimeout(() => {
        setPasswordResults(null);
      }, 5000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t('failed_to_change_password'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleReset = () => {
    setDisplayName(user.displayName ?? '');
    setCustomStatus(user.customStatus ?? '');
    setStatus(user.status ?? 'online');
    setBio(user.bio ?? '');
    setAccentColor(user.accentColor ?? null);
    setAvatarColorState(user.avatarColor ?? null);
    setCustomHex(user.accentColor ?? '');
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setAvatarPreview(null);
    setAvatarFilename(null);
    setBannerPreview(null);
    setBannerFilename(null);
    setError('');
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary">{t('my_account')}</h2>
      {user?.federationHomeOrphaned && user?.homeInstance && (
        <div className="rounded-xl bg-accent-amber/10 border border-accent-amber/25 px-3.5 py-3 text-xs text-txt-secondary leading-relaxed">
          <span className="font-medium text-txt-primary">{t('account_detached_from_home_instance')}</span>{' '}
          {user.homeInstance} {t('detached_account_operates_locally')}
          {homeConnection && (
            <>
              {' '}{t('relink_as')} <span className="font-medium text-txt-primary">{homeConnection.username}</span>{' '}
              {t('relink_on')} {user.homeInstance}{t('relink_suffix')}
              <button
                type="button"
                onClick={handleReattach}
                disabled={reattaching}
                className="mt-2 block rounded-md bg-accent-amber/20 hover:bg-accent-amber/30 disabled:opacity-50 text-txt-primary px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {reattaching
                  ? t('reattaching')
                  : reattachArmed
                    ? `${t('confirm_reattach_as')} ${homeConnection.username}`
                    : `${t('reattach_to')} ${user.homeInstance}`}
              </button>
              {reattachError && <div className="mt-1.5 text-accent-rose">{reattachError}</div>}
            </>
          )}
        </div>
      )}

      {/* ── Two-column area: preview first in DOM (so it leads on small screens),
          controls column re-ordered first on desktop via lg:order-* ── */}
      <div className="lg:flex lg:items-start lg:gap-6">
        {/* ── Live preview column (sticky on desktop, on top for small screens) ── */}
        <div className="lg:order-2 lg:w-[340px] flex-shrink-0 mb-5 lg:mb-0">
          <div className="lg:sticky lg:top-2">
            <div className="text-[10.5px] font-semibold text-txt-tertiary uppercase tracking-[0.1em] mb-2">
              {t('acct_live_preview')}
            </div>
            <div className="transition-all duration-300 ease-out motion-reduce:transition-none">
              <ProfileIdentityCard
                displayName={effectiveDisplayName}
                username={user.username}
                avatarSrc={displayAvatarSrc}
                bannerSrc={displayBannerSrc}
                avatarColor={effectiveAvatarColor}
                accentColor={effectiveAccent}
                userId={user.homeUserId ?? user.id}
                status={status}
                customStatus={customStatus.trim() || null}
                bio={bio.trim() || null}
              />
            </div>
          </div>
        </div>

        {/* Controls column */}
        <div className="min-w-0 flex-1 space-y-4 lg:order-1">

          {/* ── Profile ── */}
          <SettingsCard title={t('profile_customization')} description={t('acct_card_profile_desc')}>
            <div>
              <label className="block text-xs text-txt-secondary mb-1.5">{t('status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                className="input-standard w-full appearance-none"
              >
                <option value="online">{t('online')}</option>
                <option value="idle">{t('idle')}</option>
                <option value="dnd">{t('do_not_disturb')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-txt-secondary mb-1.5">{t('display_name')}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-standard w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-txt-secondary mb-1.5">{t('custom_status')}</label>
              <input
                type="text"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                className="input-standard w-full"
                placeholder={t('what_are_you_up_to')}
              />
            </div>
          </SettingsCard>

          {/* ── Avatar & banner ── */}
          <SettingsCard title={t('acct_card_media')} description={t('acct_card_media_desc')}>
            <div className="flex items-center gap-4">
              {/* Avatar drop zone */}
              <div
                onClick={() => avatarInputRef.current?.click()}
                onDrop={handleAvatarDrop}
                onDragOver={(e) => { e.preventDefault(); setAvatarDragActive(true); }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setAvatarDragActive(false);
                }}
                role="button"
                tabIndex={0}
                aria-label={t('change_avatar')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') avatarInputRef.current?.click(); }}
                className={`relative group w-[84px] h-[84px] rounded-full flex-shrink-0 cursor-pointer overflow-visible outline-none
                  ${avatarDragActive ? 'ring-2 ring-accent-primary' : ''}`}
              >
                <div className={`w-full h-full rounded-full overflow-hidden transition-all duration-200 motion-reduce:transition-none ${avatarDragActive ? 'scale-105' : 'group-hover:scale-[1.03]'}`}>
                  {displayAvatarSrc ? (
                    <img src={displayAvatarSrc} alt={t('avatar')} className="w-full h-full object-cover" />
                  ) : (
                    <Avatar
                      src={null}
                      name={effectiveDisplayName}
                      size={84}
                      userId={user.homeUserId ?? user.id}
                      avatarColor={effectiveAvatarColor}
                    />
                  )}
                </div>
                <div
                  className={`absolute inset-0 rounded-full bg-black/55 flex flex-col items-center justify-center gap-0.5 transition-opacity duration-200 motion-reduce:transition-none
                    ${avatarDragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[9px] font-semibold text-white">{t('change_avatar')}</span>
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Banner drop zone */}
              <div
                onClick={() => bannerInputRef.current?.click()}
                onDrop={handleBannerDrop}
                onDragOver={(e) => { e.preventDefault(); setBannerDragActive(true); }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setBannerDragActive(false);
                }}
                role="button"
                tabIndex={0}
                aria-label={t('change_banner')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') bannerInputRef.current?.click(); }}
                className={`relative group flex-1 h-[84px] rounded-xl overflow-hidden cursor-pointer border border-white/[0.06] outline-none
                  transition-all duration-200 motion-reduce:transition-none
                  ${bannerDragActive ? 'ring-2 ring-accent-primary scale-[1.01]' : 'hover:border-white/[0.12]'}`}
              >
                <div
                  className="absolute inset-0"
                  style={displayBannerSrc
                    ? { backgroundImage: `url(${displayBannerSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: mutedGradient(
                        effectiveAccent ?? getAvatarGradient(user.homeUserId ?? user.id, effectiveDisplayName, effectiveAvatarColor).from,
                        effectiveAccent ? adjustColor(effectiveAccent, -40) : getAvatarGradient(user.homeUserId ?? user.id, effectiveDisplayName, effectiveAvatarColor).to,
                        0.5
                      ) }
                  }
                />
                <div
                  className={`absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-0.5 transition-opacity duration-200 motion-reduce:transition-none
                    ${bannerDragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[9px] font-semibold text-white">{t('acct_drop_hint')}</span>
                </div>
                {uploadingBanner && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Remove actions */}
            <div className="flex gap-4">
              {(displayAvatarSrc || user.avatar) && avatarFilename !== '' && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="text-xs text-txt-tertiary hover:text-txt-danger transition-colors motion-reduce:transition-none"
                >
                  {t('remove')} · {t('avatar')}
                </button>
              )}
              {(displayBannerSrc || user.banner) && bannerFilename !== '' && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className="text-xs text-txt-tertiary hover:text-txt-danger transition-colors motion-reduce:transition-none"
                >
                  {t('remove')} · {t('banner')}
                </button>
              )}
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerSelect}
              className="hidden"
            />
          </SettingsCard>

          {/* ── Colors ── */}
          <SettingsCard title={t('acct_card_colors')} description={t('acct_card_colors_desc')}>
            {/* Avatar palette */}
            <div>
              <div className="text-[10px] font-medium text-txt-tertiary/70 uppercase tracking-wider mb-2">{t('avatar_color')}</div>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((key) => {
                  const entry = AVATAR_GRADIENT_MAP[key];
                  const isActive = avatarColorState === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAvatarColorState(key)}
                      className="w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none"
                      style={{
                        background: entry.gradient,
                        borderColor: isActive ? 'white' : 'transparent',
                        boxShadow: isActive ? `0 0 0 2px ${entry.glow}40` : 'none',
                      }}
                      title={key.charAt(0).toUpperCase() + key.slice(1)}
                      aria-pressed={isActive}
                    />
                  );
                })}
              </div>
            </div>

            {/* Banner palette */}
            <div>
              <div className="text-[10px] font-medium text-txt-tertiary/70 uppercase tracking-wider mb-2">{t('banner_color')}</div>
              <div className="grid grid-cols-8 gap-1.5 w-fit">
                {[0, 1, 2].map((row) =>
                  BANNER_COLOR_PRESETS.map((family) => {
                    const color = family[row]!;
                    const isActive = accentColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => { setAccentColor(color); setCustomHex(color); }}
                        className="w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none"
                        style={{
                          backgroundColor: color,
                          borderColor: isActive ? 'white' : 'transparent',
                          boxShadow: isActive ? `0 0 0 2px ${color}40` : 'none',
                        }}
                        title={color}
                        aria-pressed={isActive}
                      />
                    );
                  })
                )}
                {/* Native color picker swatch */}
                <label
                  className="w-7 h-7 rounded-full border-2 border-white/20 cursor-pointer flex items-center justify-center transition-all duration-150 hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none"
                  title={t('acct_custom_color')}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : '#6366f1'}
                    onChange={(e) => { setAccentColor(e.target.value); setCustomHex(e.target.value); }}
                    className="sr-only"
                    aria-label={t('acct_custom_color')}
                  />
                  <span
                    className="w-full h-full rounded-full"
                    style={{ background: 'conic-gradient(#f43f5e, #f59e0b, #10b981, #06b6d4, #6366f1, #ec4899, #f43f5e)' }}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomHex(val);
                    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                      setAccentColor(val);
                    }
                  }}
                  placeholder="#hex"
                  className="input-standard w-24 px-2 py-1.5 text-xs font-mono"
                  maxLength={7}
                />
                {accentColor && (
                  <div
                    className="w-6 h-6 rounded-full border border-white/10 flex-shrink-0"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
                {accentColor && (
                  <button
                    type="button"
                    onClick={() => { setAccentColor(null); setCustomHex(''); }}
                    className="text-xs text-txt-tertiary hover:text-txt-secondary transition-colors"
                  >
                    {t('clear')}
                  </button>
                )}
              </div>
            </div>
          </SettingsCard>

          {/* ── About me ── */}
          <SettingsCard title={t('about_me')} description={t('acct_card_about_desc')}>
            <div className="relative">
              <textarea
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= 190) setBio(e.target.value);
                }}
                rows={3}
                placeholder={t('tell_world_about_yourself')}
                className="input-standard w-full resize-none"
                maxLength={190}
              />
              <span className="absolute bottom-2 right-2 text-[10px] text-txt-tertiary tabular-nums">
                {bio.length}/190
              </span>
            </div>
          </SettingsCard>

          {/* ── Password ── */}
          <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
            <SettingsCard title={t('password')} description={t('acct_card_password_desc')}>
              <input type="text" autoComplete="username" value={user.username} readOnly tabIndex={-1} className="sr-only" />
              <div>
                <label className="block text-xs text-txt-secondary mb-1.5">{t('current_password')}</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-standard w-full pr-10"
                    placeholder={t('enter_current_password')}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-secondary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {showCurrentPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-txt-secondary mb-1.5">{t('new_password')}</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-standard w-full pr-10"
                    placeholder={t('minimum_6_characters')}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-secondary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {showNewPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-txt-secondary mb-1.5">{t('confirm_new_password')}</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="input-standard w-full"
                  placeholder={t('confirm_new_password_placeholder')}
                  autoComplete="new-password"
                />
              </div>

              {passwordError && (
                <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-xs">{passwordError}</div>
              )}
              {passwordResults && passwordResults.length > 0 && (
                <div className="space-y-1">
                  {passwordResults.map(r => (
                    <div key={r.origin} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]">
                      <span className="text-txt-secondary">{r.origin}</span>
                      {r.success ? (
                        <span className="text-status-online">{t('synced')}</span>
                      ) : (
                        <span className="text-txt-danger" title={r.error}>{t('failed_will_sync_on_reconnect')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || !confirmNewPassword}
                className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordLoading ? t('changing') : t('change_password')}
              </button>
            </SettingsCard>
          </form>

          {/* ── Danger Zone ── */}
          <div className="rounded-xl border border-accent-rose/20 bg-accent-rose/[0.04] overflow-hidden">
            <header className="px-4 pt-3.5 pb-1">
              <h3 className="text-[10.5px] font-semibold text-txt-danger uppercase tracking-[0.1em]">{t('danger_zone')}</h3>
            </header>
            <div className="px-4 pb-4 pt-2">
              <p className="text-sm text-txt-secondary mb-3">
                {t('delete_account_warning')}
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-accent-rose hover:bg-accent-rose/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('delete_account')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">{error}</div>
      )}

      {hasChanges && (
        <div className="sticky bottom-0 z-10 pointer-events-none">
          <div className="flex justify-center pt-3 pb-1">
            <div className="glass-bubble rounded-full px-4 py-2 flex items-center gap-2 animate-slide-up pointer-events-auto">
              <button
                onClick={handleReset}
                className="px-3 py-1 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors"
              >
                {t('reset')}
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading || uploadingAvatar || uploadingBanner}
                className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              >
                {isLoading ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modals */}
      <ImageCropModal
        isOpen={avatarCropSrc !== null}
        onClose={() => setAvatarCropSrc(null)}
        imageSrc={avatarCropSrc ?? ''}
        onCropComplete={handleAvatarCropComplete}
        title={t('crop_avatar')}
        cropShape="round"
        aspectRatio={1}
        maxOutputDimension={256}
      />
      <ImageCropModal
        isOpen={bannerCropSrc !== null}
        onClose={() => setBannerCropSrc(null)}
        imageSrc={bannerCropSrc ?? ''}
        onCropComplete={handleBannerCropComplete}
        title={t('crop_banner')}
        cropShape="rect"
        aspectRatio={3}
        maxOutputDimension={1280}
      />

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
