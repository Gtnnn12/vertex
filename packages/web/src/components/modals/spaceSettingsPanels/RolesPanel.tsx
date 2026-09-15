import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSpaceStore } from '../../../stores/spaceStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { api } from '../../../api/client';
import { hasPermissionBit, PermissionBits, stringToPermissions, permissionsToString } from '../../../utils/permissions';
import type { Role } from '@vertex/shared';

// ─── Permission display groups ─────────────────────────────────────────────

interface PermDef {
  bit: bigint;
  labelKey: string;
}

const PERMISSION_GROUPS: { nameKey: string; perms: PermDef[] }[] = [
  {
    nameKey: 'perm_group_general',
    perms: [
      { bit: PermissionBits.ADMINISTRATOR, labelKey: 'perm_administrator' },
      { bit: PermissionBits.VIEW_CHANNEL, labelKey: 'perm_view_channels' },
      { bit: PermissionBits.MANAGE_CHANNELS, labelKey: 'perm_manage_channels' },
      { bit: PermissionBits.MANAGE_ROLES, labelKey: 'perm_manage_roles' },
      { bit: PermissionBits.MANAGE_SPACE, labelKey: 'perm_manage_space' },
      { bit: PermissionBits.CREATE_INVITE, labelKey: 'perm_create_invite' },
      { bit: PermissionBits.KICK_MEMBERS, labelKey: 'perm_kick_members' },
      { bit: PermissionBits.BAN_MEMBERS, labelKey: 'perm_ban_members' },
    ],
  },
  {
    nameKey: 'perm_group_text',
    perms: [
      { bit: PermissionBits.SEND_MESSAGES, labelKey: 'perm_send_messages' },
      { bit: PermissionBits.MANAGE_MESSAGES, labelKey: 'perm_manage_messages' },
      { bit: PermissionBits.ATTACH_FILES, labelKey: 'perm_attach_files' },
      { bit: PermissionBits.READ_MESSAGE_HISTORY, labelKey: 'perm_read_message_history' },
      { bit: PermissionBits.ADD_REACTIONS, labelKey: 'perm_add_reactions' },
    ],
  },
  {
    nameKey: 'perm_group_voice',
    perms: [
      { bit: PermissionBits.CONNECT, labelKey: 'perm_connect' },
      { bit: PermissionBits.SPEAK, labelKey: 'perm_speak' },
      { bit: PermissionBits.MUTE_MEMBERS, labelKey: 'perm_mute_members' },
      { bit: PermissionBits.DEAFEN_MEMBERS, labelKey: 'perm_deafen_members' },
      { bit: PermissionBits.MOVE_MEMBERS, labelKey: 'perm_move_members' },
      { bit: PermissionBits.DISCONNECT_MEMBERS, labelKey: 'perm_disconnect_members' },
      { bit: PermissionBits.STREAM, labelKey: 'perm_stream' },
    ],
  },
];

const PRESET_COLORS = [
  '#b9bbbe', '#a5f3c4', '#ffc9a9', '#c4b5fd', '#93c5fd',
  '#fbbf24', '#fda4af', '#f87171', '#60a5fa', '#34d399',
];

/** Auto-increment a base name ("Foo" → "Foo 2" → "Foo 3") to avoid uniqueness conflicts. */
function getUniqueRoleName(baseName: string, existingRoles: Role[]): string {
  const existingNames = new Set(existingRoles.map((r) => r.name.toLowerCase()));
  let candidateName = baseName;
  let counter = 2;
  while (existingNames.has(candidateName.toLowerCase())) {
    candidateName = `${baseName} ${counter}`;
    counter++;
  }
  return candidateName;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface RolesPanelProps {
  spaceId: string;
}

export function RolesPanel({ spaceId }: RolesPanelProps) {
  const roles = useSpaceStore((s) => s.roles);
  const members = useSpaceStore((s) => s.members);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const spaces = useSpaceStore((s) => s.spaces);
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const { t } = useLanguage();

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [isNewRole, setIsNewRole] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const myUserId = useAuthStore((s) => s.user?.id);
  const space = spaces.find((s) => s.id === spaceId);
  const ownerId = space?.ownerId;
  const myPerms = spacePermissions.get(spaceId);
  const canManageRoles = hasPermissionBit(myPerms, PermissionBits.MANAGE_ROLES);

  const myHighestRolePosition = React.useMemo(() => {
    if (!myUserId) return -1;
    const me = members.find((m) => m.userId === myUserId);
    if (!me || !me.roles || me.roles.length === 0) return -1;
    return Math.max(...me.roles.map((r) => r.position));
  }, [members, myUserId]);

  const isOwner = ownerId === myUserId;

  // Sort: non-everyone roles by position desc, @everyone always last
  const sortedRoles = [...roles].sort((a, b) => {
    const aIsEveryone = a.id === spaceId;
    const bIsEveryone = b.id === spaceId;
    if (aIsEveryone) return 1;
    if (bIsEveryone) return -1;
    return b.position - a.position;
  });

  // Owner can always reorder; otherwise need MANAGE_ROLES and a role with position > 0
  const canReorder = isOwner || (canManageRoles && myHighestRolePosition > 0);

  const getRolePosition = (role: Role): number => {
    if (role.id === spaceId) return -Infinity;
    return role.position;
  };

  const canMoveRole = useCallback(
    (fromIndex: number, toIndex: number): boolean => {
      if (!canReorder) return false;
      const fromRole = sortedRoles[fromIndex];
      if (!fromRole) return false;
      if (fromRole.id === spaceId) return false;

      const fromPosition = getRolePosition(fromRole);
      const toRole = sortedRoles[toIndex];
      if (!toRole) return false;
      if (toRole.id === spaceId) return false;
      const toPosition = getRolePosition(toRole);

      // Owner can move any role freely
      if (isOwner) return true;

      // For non-owners: can't move to a position higher than own highest role
      if (fromPosition >= toPosition) {
        return myHighestRolePosition > toPosition;
      } else {
        return myHighestRolePosition >= toPosition;
      }
    },
    [canReorder, sortedRoles, spaceId, isOwner, myHighestRolePosition]
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    if (!canMoveRole(draggedIndex, targetIndex)) {
      setDraggedIndex(null);
      return;
    }

    setReordering(true);
    const addToast = useUIStore.getState().addToast;

    try {
      const newRoles = [...sortedRoles];
      const [draggedRole] = newRoles.splice(draggedIndex, 1);
      newRoles.splice(targetIndex, 0, draggedRole);

      const nonEveryoneRoles = newRoles.filter((r) => r.id !== spaceId);
      const everyoneRole = newRoles.find((r) => r.id === spaceId);

      const updates: { roleId: string; position: number }[] = [];
      nonEveryoneRoles.forEach((role, idx) => {
        const newPosition = nonEveryoneRoles.length - idx;
        if (role.position !== newPosition) {
          updates.push({ roleId: role.id, position: newPosition });
        }
      });

      for (const update of updates) {
        await api.roles.update(spaceId, update.roleId, { position: update.position });
      }

      await loadSpaceDetail(spaceId);
      addToast(t('roles_reordered'), 'success', 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('failed_to_reorder_roles');
      useUIStore.getState().addToast(errorMsg, 'warning', 3000);
    } finally {
      setDraggedIndex(null);
      setReordering(false);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleCreateRole = async () => {
    setCreating(true);
    setError('');
    try {
      const uniqueName = getUniqueRoleName(t('new_role'), roles);
      const newRole = await api.roles.create(spaceId, { name: uniqueName });
      await loadSpaceDetail(spaceId);
      setIsNewRole(true);
      setEditingRoleId(newRole.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed_to_create_role'));
    } finally {
      setCreating(false);
    }
  };

  if (editingRoleId) {
    const role = roles.find((r) => r.id === editingRoleId);
    if (!role) {
      setEditingRoleId(null);
      return null;
    }
    return (
      <RoleEditView
        key={editingRoleId}
        role={role}
        spaceId={spaceId}
        isNew={isNewRole}
        onBack={() => { setIsNewRole(false); setEditingRoleId(null); }}
        onDeleted={() => { setIsNewRole(false); setEditingRoleId(null); }}
        onCopied={(newRoleId) => { setIsNewRole(true); setEditingRoleId(newRoleId); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('roles')}</h2>
      {error && (
        <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">{error}</div>
      )}

      <div className="sticky top-0 z-10 pointer-events-none pb-3">
        <button
          onClick={handleCreateRole}
          disabled={creating}
          className="glass-bubble rounded-full px-3 py-1.5 flex items-center gap-1.5 text-sm text-txt-primary hover:text-txt-secondary transition-colors pointer-events-auto disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {creating ? t('creating') : t('create_role')}
        </button>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">{t('roles')}</div>
        <p className="text-xs text-txt-tertiary mb-2">{t('roles_hint')}</p>
        <div className="rounded-lg bg-white/[0.02] p-2">
          <div className="space-y-0.5">
            {sortedRoles.map((role, index) => {
              const isEveryone = role.id === spaceId;
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;
              const canDrag = canReorder && !isEveryone;

              return (
                <div
                  key={role.id}
                  draggable={canDrag}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={[
                    'w-full flex items-center justify-between px-3 py-2 rounded transition-all text-left group',
                    isDragging ? 'opacity-50 scale-[0.98]' : '',
                    isDragOver && draggedIndex !== null && draggedIndex !== index ? 'bg-accent-primary/20 ring-1 ring-accent-primary/50' : 'hover:bg-interactive-hover',
                  ].filter(Boolean).join(' ')}
                >
                  <button
                    onClick={() => { setIsNewRole(false); setEditingRoleId(role.id); }}
                    className="flex items-center gap-2.5 min-w-0 flex-1"
                  >
                    {canDrag && (
                      <svg
                        className="w-4 h-4 text-txt-tertiary/40 hover:text-txt-tertiary cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <circle cx="9" cy="6" r="1.5" />
                        <circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" />
                        <circle cx="15" cy="18" r="1.5" />
                      </svg>
                    )}
                    {!canDrag && (
                      <div className="w-4 h-4 flex-shrink-0" />
                    )}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="text-sm text-txt-primary truncate">
                      {isEveryone ? '@everyone' : role.name}
                    </span>
                  </button>
                  <svg
                    className="w-4 h-4 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0 ml-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
          </div>
          {reordering && (
            <div className="absolute inset-0 bg-surface-base/50 flex items-center justify-center rounded-lg">
              <div className="text-sm text-txt-secondary">{t('reordering')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Role Edit View ─────────────────────────────────────────────────────────

interface RoleEditViewProps {
  role: Role;
  spaceId: string;
  isNew?: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onCopied: (newRoleId: string) => void;
}

function RoleEditView({ role, spaceId, isNew, onBack, onDeleted, onCopied }: RoleEditViewProps) {
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const roles = useSpaceStore((s) => s.roles);
  const isEveryone = role.id === spaceId;
  const { t } = useLanguage();

  const [draftName, setDraftName] = useState(role.name);
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEveryone && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  const validateName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return t('role_name_empty');
    const isDuplicate = roles.some(
      (r) => r.id !== role.id && r.name.toLowerCase() === trimmed.toLowerCase()
    );
    return isDuplicate ? t('role_name_duplicate') : '';
  };

  const [draftColor, setDraftColor] = useState(role.color);
  const [draftPermissions, setDraftPermissions] = useState<bigint>(
    stringToPermissions(role.permissions)
  );
  const addToast = useUIStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasNameChange = !isEveryone && draftName.trim() !== role.name;
  const hasColorChange = !isEveryone && draftColor !== role.color;
  const hasPermChange = permissionsToString(draftPermissions) !== (role.permissions ?? '0');
  const hasChanges = hasNameChange || hasColorChange || hasPermChange;

  const togglePermission = (bit: bigint) => {
    setDraftPermissions((prev) => (prev & bit) !== 0n ? prev & ~bit : prev | bit);
  };

  const handleSave = async () => {
    setConfirmDelete(false);
    setSaving(true);
    setSaveError('');
    try {
      const data: { name?: string; color?: string; permissions?: string } = {};
      if (hasNameChange) data.name = draftName.trim();
      if (hasColorChange) data.color = draftColor;
      if (hasPermChange) data.permissions = permissionsToString(draftPermissions);
      await api.roles.update(spaceId, role.id, data);
      await loadSpaceDetail(spaceId);
      addToast(t('role_saved'), 'success', 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('failed_to_save_role');
      if (msg.includes('already exists')) {
        setNameError(msg);
      } else {
        setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftName(role.name);
    setDraftColor(role.color);
    setDraftPermissions(stringToPermissions(role.permissions));
    setConfirmDelete(false);
    setSaveError('');
    setNameError('');
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setSaveError('');
    try {
      await api.roles.delete(spaceId, role.id);
      await loadSpaceDetail(spaceId);
      onDeleted();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('failed_to_delete_role'));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    setSaveError('');
    try {
      const uniqueName = getUniqueRoleName(t('copy_of').replace('{name}', role.name), roles);
      const newRole = await api.roles.create(spaceId, {
        name: uniqueName,
        color: role.color,
        permissions: role.permissions ?? undefined,
      });
      await loadSpaceDetail(spaceId);
      onCopied(newRole.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('failed_to_copy_role'));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back button */}
      <div className="sticky top-0 z-10 pointer-events-none pb-3">
        <button
          onClick={onBack}
          className="glass-bubble rounded-full px-3 py-1.5 flex items-center gap-1 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors pointer-events-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('back_to_roles')}
        </button>
      </div>

      {isNew && !hasChanges && (
        <div className="p-2 bg-status-online/10 border border-status-online/30 rounded text-status-online text-sm">
          {t('role_created_hint')}
        </div>
      )}

      {/* Identity card (Name + Color — not shown for @everyone) */}
      {!isEveryone && (
        <div>
          <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">{t('identity')}</div>
          <div className="rounded-lg bg-white/[0.02] p-3.5 space-y-4">
            <div>
              <label className="block text-xs text-txt-secondary mb-1.5">
                {t('role_name')}
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setNameError(validateName(e.target.value));
                }}
                onBlur={() => setNameError(validateName(draftName))}
                className={`input-standard w-full${nameError ? ' ring-2 ring-accent-rose' : ''}`}
              />
              {nameError && (
                <p className="text-xs text-txt-danger mt-1">{nameError}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-txt-secondary mb-1.5">
                {t('role_color')}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraftColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      draftColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative w-7 h-7 rounded-full border-2 border-border-subtle hover:border-accent-primary transition-colors cursor-pointer overflow-hidden">
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-red-400 via-green-400 to-blue-400" />
                </label>
                <input
                  type="text"
                  value={draftColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDraftColor(v);
                  }}
                  className="input-standard w-20 px-2 py-1 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permission groups — each gets its own section card */}
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.nameKey}>
          <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">
            {t(group.nameKey)}
          </div>
          <div className="rounded-lg bg-white/[0.02] p-3.5">
            <div className="space-y-1">
              {group.perms.map((perm) => {
                const isAdminBit = perm.bit === PermissionBits.ADMINISTRATOR;
                const hasAdmin = (draftPermissions & PermissionBits.ADMINISTRATOR) !== 0n;
                const isOn = isAdminBit ? hasAdmin : hasAdmin || (draftPermissions & perm.bit) !== 0n;
                const isInherited = !isAdminBit && hasAdmin;
                return (
                  <label
                    key={perm.labelKey}
                    className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer group/perm ${
                      isInherited ? 'opacity-50 cursor-default' : 'hover:bg-interactive-hover'
                    }`}
                  >
                    <span className={`text-sm ${isAdminBit ? 'text-txt-danger font-medium' : 'text-txt-primary'}`}>
                      {t(perm.labelKey)}
                    </span>
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        if (!isInherited) togglePermission(perm.bit);
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        isInherited ? 'cursor-default' : 'cursor-pointer'
                      } ${isOn ? 'bg-accent-primary' : 'bg-interactive-muted'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                          isOn ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {saveError && (
        <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">{saveError}</div>
      )}
      <div className="sticky bottom-0 z-10 pointer-events-none">
          <div className="flex justify-center pt-3 pb-1">
            <div className={`glass-bubble rounded-full px-4 py-2 flex items-center gap-2 pointer-events-auto${
              isEveryone ? ' animate-slide-up' : ''
            }`}>
              {hasChanges && (
                <>
                  <button
                    onClick={handleDiscard}
                    className="px-3 py-1 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors"
                  >
                    {t('discard')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || (!isEveryone && !draftName.trim()) || !!nameError}
                    className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                  >
                    {saving ? t('saving') : t('save')}
                  </button>
                </>
              )}
              {hasChanges && (
                <div className="w-px h-5 bg-white/10" />
              )}
              <button
                onClick={handleCopy}
                disabled={copying}
                className="px-3 py-1.5 text-sm font-medium rounded-full text-txt-secondary hover:bg-interactive-hover transition-colors disabled:opacity-50"
              >
                {copying ? t('copying') : t('copy_role')}
              </button>
              {!isEveryone && (
                <>
                  <div className="w-px h-5 bg-white/10" />
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors disabled:opacity-50 ${
                      confirmDelete
                        ? 'bg-accent-rose/15 text-accent-rose'
                        : 'text-accent-rose hover:bg-accent-rose/10'
                    }`}
                  >
                    {deleting ? t('deleting') : confirmDelete ? t('confirm_question') : t('delete_role')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}
