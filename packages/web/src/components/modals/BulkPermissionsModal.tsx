import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { TriStateToggle, type TriState } from '../ui/TriStateToggle';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore, getApiForOrigin } from '../../stores/spaceStore';
import { PermissionBits, hasPermissionBit } from '../../utils/permissions';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Channel, Role } from '@vertex/shared';
import type { PermissionDef } from '../ui/OverrideEntry';

const BULK_PERMISSIONS: (PermissionDef & { voiceOnly?: boolean })[] = [
  { key: 'VIEW_CHANNEL', label: 'View Channel', bit: PermissionBits.VIEW_CHANNEL },
  { key: 'READ_MESSAGE_HISTORY', label: 'Read History', bit: PermissionBits.READ_MESSAGE_HISTORY },
  { key: 'SEND_MESSAGES', label: 'Send Messages', bit: PermissionBits.SEND_MESSAGES },
  { key: 'ADD_REACTIONS', label: 'Add Reactions', bit: PermissionBits.ADD_REACTIONS },
  { key: 'CONNECT', label: 'Voice Connect', bit: PermissionBits.CONNECT },
  { key: 'SPEAK', label: 'Speak', bit: PermissionBits.SPEAK },
  { key: 'MANAGE_CHANNELS', label: 'Manage Channels', bit: PermissionBits.MANAGE_CHANNELS },
];

type DraftState = Map<string, { allow: bigint; deny: bigint }>;

export function BulkPermissionsModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const isOpen = activeModal === 'bulkPermissions';

  const channels = useSpaceStore((s) => s.channels);
  const categories = useSpaceStore((s) => s.categories);
  const roles = useSpaceStore((s) => s.roles);
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const { t } = useLanguage();

  const space = spaces.find((s) => s.id === currentSpaceId);
  const mySpacePerms = currentSpaceId ? spacePermissions.get(currentSpaceId) : undefined;
  const canManage = hasPermissionBit(mySpacePerms, PermissionBits.MANAGE_ROLES);

  // ── Wizard state ──
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Draft overrides: role id → { allow, deny } bitmasks
  const [draft, setDraft] = useState<DraftState>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSearch('');
      setSelected(new Set());
      setDraft(new Map());
      setSaving(false);
      setSaveError('');
      setSaveSuccess(false);
    }
  }, [isOpen]);

  // ── Dynamic channel grouping — same source + shape as the sidebar ──
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories]
  );
  const channelsByCategory = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const ch of channels) {
      if (!ch.categoryId) continue;
      let arr = map.get(ch.categoryId);
      if (!arr) { arr = []; map.set(ch.categoryId, arr); }
      arr.push(ch);
    }
    for (const [key, arr] of map) {
      map.set(key, arr.sort((a, b) => a.position - b.position));
    }
    return map;
  }, [channels]);
  const uncategorizedChannels = useMemo(
    () => channels.filter((c) => !c.categoryId).sort((a, b) => a.position - b.position),
    [channels]
  );
  const partitionChannels = useCallback((list: Channel[]) => ({
    text: list.filter((c) => c.type !== 'voice'),
    voice: list.filter((c) => c.type === 'voice'),
  }), []);

  const filtered = useCallback((list: Channel[]) => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const totalMatches = useMemo(() => {
    const inCats = sortedCategories.reduce((n, cat) => n + filtered(channelsByCategory.get(cat.id) ?? []).length, 0);
    return inCats + filtered(uncategorizedChannels).length;
  }, [sortedCategories, channelsByCategory, uncategorizedChannels, filtered]);

  const toggleChannel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedChannels = useMemo(
    () => channels.filter((c) => selected.has(c.id)),
    [channels, selected]
  );

  // ── Draft helpers ──
  const getRoleState = useCallback((roleId: string, bit: bigint): TriState => {
    const d = draft.get(roleId);
    if (!d) return 'neutral';
    if ((d.allow & bit) !== 0n) return 'allow';
    if ((d.deny & bit) !== 0n) return 'deny';
    return 'neutral';
  }, [draft]);

  const setRoleState = useCallback((roleId: string, bit: bigint, state: TriState) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const d = { ...(next.get(roleId) ?? { allow: 0n, deny: 0n }) };
      d.allow &= ~bit;
      d.deny &= ~bit;
      if (state === 'allow') d.allow |= bit;
      if (state === 'deny') d.deny |= bit;
      next.set(roleId, d);
      return next;
    });
  }, []);

  // Any non-neutral cell at all?
  const hasChanges = useMemo(
    () => [...draft.values()].some((d) => d.allow !== 0n || d.deny !== 0n),
    [draft]
  );

  // ── "Private" quick action: @everyone loses VIEW_CHANNEL, custom roles gain it ──
  const applyPrivate = useCallback(() => {
    const everyoneId = currentSpaceId; // @everyone role id === space id
    if (!everyoneId) return;
    setDraft((prev) => {
      const next = new Map(prev);
      for (const role of roles) {
        const d = { ...(next.get(role.id) ?? { allow: 0n, deny: 0n }) };
        if (role.isEveryone || role.id === everyoneId) {
          d.deny |= PermissionBits.VIEW_CHANNEL;
          d.allow &= ~PermissionBits.VIEW_CHANNEL;
        } else {
          d.allow |= PermissionBits.VIEW_CHANNEL;
          d.deny &= ~PermissionBits.VIEW_CHANNEL;
        }
        next.set(role.id, d);
      }
      return next;
    });
  }, [roles, currentSpaceId]);

  // ── Save: sequential PUTs through the existing per-channel endpoint ──
  const handleSave = useCallback(async () => {
    if (!currentSpaceId || !selectedChannels.length || !hasChanges) return;
    const channelApi = getApiForOrigin(space?._instanceOrigin ?? '');
    const jobs: { channelId: string; roleId: string; allow: bigint; deny: bigint }[] = [];
    for (const ch of selectedChannels) {
      for (const [roleId, d] of draft) {
        if (d.allow !== 0n || d.deny !== 0n) {
          jobs.push({ channelId: ch.id, roleId, allow: d.allow, deny: d.deny });
        }
      }
    }
    setSaving(true);
    setSaveError('');
    setSaveProgress({ done: 0, total: jobs.length });
    try {
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        await channelApi.channels.putOverride(j.channelId, {
          targetType: 'role',
          targetId: j.roleId,
          allow: j.allow.toString(),
          deny: j.deny.toString(),
        });
        setSaveProgress({ done: i + 1, total: jobs.length });
      }
      setSaveSuccess(true);
      setTimeout(() => closeModal(), 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }, [currentSpaceId, selectedChannels, draft, hasChanges, space, closeModal]);

  if (!isOpen) return null;
  if (!canManage) {
    return (
      <Modal isOpen onClose={closeModal} title="Permissions" maxWidth="max-w-md">
        <p className="text-sm text-txt-secondary px-1 py-4">
          You need the Manage Roles permission to edit channel permissions.
        </p>
      </Modal>
    );
  }

  const stepHeading = step === 1
    ? (roles.length, t('bulk_perm_choose_channels'))
    : t('bulk_perm_roles_title');

  return (
    <Modal isOpen onClose={closeModal} title="Channel Permissions" maxWidth="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 px-1 mb-3">
        {[1, 2].map((s) => (
          <React.Fragment key={s}>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                step >= s ? 'bg-accent-primary text-white' : 'bg-white/[0.06] text-txt-tertiary'
              }`}
            >
              {s}
            </span>
            {s === 1 && <span className="flex-1 h-px bg-white/[0.07]" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <>
          {/* Search */}
          <div className="px-1 mb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('bulk_perm_search_channels')}
              className="w-full h-9 px-3 rounded-lg bg-surface-input border border-white/[0.07] text-sm text-txt-primary placeholder:text-txt-tertiary/60 outline-none focus:border-accent-primary/50 transition-colors"
            />
          </div>

          {/* Channel list — dynamic, grouped like the sidebar */}
          <div className="max-h-[46vh] overflow-y-auto scrollbar-thin rounded-xl border border-white/[0.05] bg-white/[0.02] p-2 space-y-3">
            {totalMatches === 0 && (
              <p className="text-sm text-txt-tertiary text-center py-6">
                {search ? t('bulk_perm_no_matches') : t('bulk_perm_no_channels')}
              </p>
            )}
            {sortedCategories.map((cat) => {
              const { text, voice } = partitionChannels(filtered(channelsByCategory.get(cat.id) ?? []));
              if (text.length + voice.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="px-1 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary/80">
                    {cat.name}
                  </div>
                  <ChannelCheckList text={text} voice={voice} selected={selected} onToggle={toggleChannel} />
                </div>
              );
            })}
            {(() => {
              const { text, voice } = partitionChannels(filtered(uncategorizedChannels));
              if (text.length + voice.length === 0) return null;
              return (
                <div>
                  <div className="px-1 mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary/80">
                    {t('channels')}
                  </div>
                  <ChannelCheckList text={text} voice={voice} selected={selected} onToggle={toggleChannel} />
                </div>
              );
            })()}
          </div>

          {/* Footer step 1 */}
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-[12px] text-txt-tertiary">
              {t('bulk_perm_selected_count').replace('{n}', String(selected.size))}
            </span>
            <button
              onClick={() => selected.size > 0 && setStep(2)}
              disabled={selected.size === 0}
              className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-accent-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {t('bulk_perm_next')}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {/* Private quick action */}
          <div className="px-1 mb-2 flex items-center justify-between">
            <span className="text-[12px] text-txt-tertiary">{t('bulk_perm_roles_hint')}</span>
            <button
              onClick={applyPrivate}
              className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold border border-accent-primary/30 text-accent-primary hover:bg-accent-primary/10 transition-colors"
            >
              {t('bulk_perm_private')}
            </button>
          </div>

          {/* Role rows — tri-state per permission */}
          <div className="max-h-[46vh] overflow-y-auto scrollbar-thin space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: role.color || '#b9bbbe' }} />
                  <span className="text-[13px] font-semibold text-txt-primary truncate">{role.name}</span>
                  {role.isEveryone && (
                    <span className="text-[9.5px] uppercase tracking-wide text-txt-tertiary px-1.5 py-px rounded bg-white/[0.05]">
                      @everyone
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {BULK_PERMISSIONS.map((p) => (
                    <div key={p.key} className="flex items-center justify-between">
                      <span className="text-[12px] text-txt-secondary">{p.label}</span>
                      <TriStateToggle
                        value={getRoleState(role.id, p.bit)}
                        onChange={(v) => setRoleState(role.id, p.bit, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Summary + save */}
          <div className="flex items-center justify-between mt-3 px-1 gap-2">
            <span className="text-[12px] text-txt-tertiary">
              {saveError
                ? <span className="text-accent-rose">{saveError}</span>
                : saveSuccess
                  ? <span className="text-accent-mint">✓ {t('bulk_perm_saved')}</span>
                  : t('bulk_perm_summary').replace('{n}', String(selectedChannels.length))}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-white/[0.05] transition-colors"
              >
                {t('bulk_perm_back')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges || saveSuccess}
                className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-accent-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
              >
                {saving
                  ? `${t('bulk_perm_saving')} ${saveProgress.done}/${saveProgress.total}`
                  : t('bulk_perm_save')}
              </button>
            </div>
          </div>
          {saving && (
            <div className="mt-2 mx-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-200"
                style={{ width: `${saveProgress.total ? (saveProgress.done / saveProgress.total) * 100 : 0}%` }}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function ChannelCheckList({
  text,
  voice,
  selected,
  onToggle,
}: {
  text: Channel[];
  voice: Channel[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const renderRow = (channel: Channel) => {
    const checked = selected.has(channel.id);
    return (
      <button
        key={channel.id}
        onClick={() => onToggle(channel.id)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
          checked ? 'bg-accent-primary/10' : 'hover:bg-white/[0.04]'
        }`}
      >
        <span
          className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${
            checked ? 'bg-accent-primary border-accent-primary' : 'border-white/[0.15]'
          }`}
        >
          {checked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
        {channel.type === 'voice' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-txt-tertiary flex-shrink-0">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
          </svg>
        ) : (
          <span className="text-txt-tertiary text-[13px] flex-shrink-0">#</span>
        )}
        <span className={`text-[13px] truncate ${checked ? 'text-txt-primary' : 'text-txt-secondary'}`}>
          {channel.name}
        </span>
      </button>
    );
  };
  return (
    <div className="space-y-px">
      {text.map(renderRow)}
      {voice.map(renderRow)}
    </div>
  );
}
