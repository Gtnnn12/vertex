import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  User,
  Space,
  SpaceWithChannelsAndMembers,
  Channel,
  ChannelCategory,
  MessageWithUser,
  MemberWithUser,
  DmChannel,
  DmMessageWithUser,
  CreateSpaceRequest,
  UpdateSpaceRequest,
  CreateChannelRequest,
  UpdateChannelRequest,
  CreateMessageRequest,
  UpdateMessageRequest,
  UpdateUserRequest,
  JoinSpaceRequest,
  UpdateMemberRequest,
  LiveKitTokenResponse,
  CreateDmRequest,
  AddDmMemberRequest,
  CreateGroupDmRequest,
  TransferOwnershipRequest,
  CreateDmMessageRequest,
  Friend,
  FriendRequest,
  DiscoverUser,
  InstanceStreamingLimits,
  InstanceAdminSettings,
  InstanceInfoResponse,
  VerifyPasswordResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  DeleteAccountRequest,
  StorageStats,
  OrphanedFile,
  CleanupResult,
  AdminUserListResponse,
  AdminUser,
  AdminResetPasswordResponse,
  AdminCenterSummary,
  AdminCenterUsersResponse,
  AdminCenterUserDetail,
  NetrexGrantRequest,
  NetrexStatusResult,
  StaffAssignResult,
  StaffMember,
  StaffRole,
  ModerationRequest,
  ModerationResult,
  AuditLogResponse,
  AdminCenterSpacesResponse,
  AdminCenterSpaceDetail,
  AdminCenterActivityResponse,
  ExploreSpace,
  JoinRequest,
  Role,
  SpaceLayoutItem,
  SpaceFolder,
  InvitePreview,
  GifResult,
  FederationRegistryEntry,
  FederationIdentityDeleteRequest,
  FederationIdentityDeleteResponse,
  FederationPeer,
  FederationOrphanedAccount,
  FederationResetEvent,
  FederationResetEventsResponse,
  ApprovalRequest,
  PeeringSubscription,
  PeeringNotification,
  InviteLinkSummary,
  InviteRedemption,
  CreateInviteRequest,
  UpdateInviteRequest,
  ReinstateInviteRequest,
  ReinstateInviteResponse,
  CheckInviteResponse,
  SpaceInviteRequest,
  SpaceInviteResponse,
  AttachProofResponse,
  ReattachRequest,
  ReattachResponse,
  UserSuggestion,
} from '@backspace/shared';
import { getApiForOrigin, getOwnerInstanceForDm } from '../utils/crossStoreResolvers';

export type { FederationPeer, FederationOrphanedAccount, FederationResetEvent, FederationResetEventsResponse, ApprovalRequest, PeeringSubscription, PeeringNotification };/** The server could not be reached at all (down, DNS, proxy refused). */
export class NetworkError extends Error {
  constructor() {
    super('Cannot reach the server');
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class HttpError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** Vertex AI chat reply: success carries text; failures carry an honest message. */
export interface AIChatClientResult {
  ok: boolean;
  text?: string;
  model?: string;
  netrex?: boolean;
  remaining: number | null;
  message?: string;
}

export class BackspaceApiClient {
  readonly auth: {
    register: (data: RegisterRequest) => Promise<AuthResponse>;
    login: (data: LoginRequest) => Promise<AuthResponse>;
    checkUsername: (username: string) => Promise<{ available: boolean; reason?: string }>;
    checkInvite: (token: string) => Promise<CheckInviteResponse>;
    attachProof: (targetDomain: string) => Promise<AttachProofResponse>;
  };

  readonly users: {
    me: () => Promise<User>;
    update: (data: UpdateUserRequest) => Promise<User>;
    get: (id: string) => Promise<User>;
    verifyPassword: (password: string) => Promise<VerifyPasswordResponse>;
    changePassword: (data: ChangePasswordRequest) => Promise<ChangePasswordResponse>;
    deleteAccount: (data: DeleteAccountRequest) => Promise<{ success: boolean }>;
    getMutuals: (id: string, homeUserId?: string) => Promise<{ mutualFriends: User[]; mutualSpaces: { id: string; name: string; icon: string | null; avatarColor: string | null }[] }>;
    saveBoard: (widgets: unknown[]) => Promise<{ widgets: unknown[] }>;
    getFederationRegistry: () => Promise<{ registry: FederationRegistryEntry[]; updatedAt: number }>;
    putFederationRegistry: (data: { registry: FederationRegistryEntry[]; updatedAt: number }) => Promise<{ ok: boolean; updatedAt: number }>;
    deleteFederationIdentity: (data: FederationIdentityDeleteRequest) => Promise<FederationIdentityDeleteResponse>;
    reattach: (data: ReattachRequest) => Promise<ReattachResponse>;
  };

  readonly spaceLayout: {
    update: (data: { items: SpaceLayoutItem[]; folders: Record<string, { name: string | null; color: string | null; spaceIds: string[] }>; updatedAt?: number }) => Promise<{ items: SpaceLayoutItem[]; folders: SpaceFolder[]; updatedAt?: number }>;
  };

  readonly spaces: {
    list: () => Promise<Space[]>;
    get: (id: string) => Promise<SpaceWithChannelsAndMembers>;
    create: (data: CreateSpaceRequest) => Promise<Space>;
    update: (id: string, data: UpdateSpaceRequest) => Promise<Space>;
    delete: (id: string) => Promise<{ success: boolean }>;
    invite: (id: string) => Promise<{ inviteCode: string }>;
    join: (id: string, data: JoinSpaceRequest) => Promise<Space>;
    joinByCode: (inviteCode: string) => Promise<Space>;
    members: (id: string) => Promise<MemberWithUser[]>;
    updateMember: (spaceId: string, userId: string, data: UpdateMemberRequest) => Promise<MemberWithUser>;
    removeMember: (spaceId: string, userId: string) => Promise<{ success: boolean }>;
    getBans: (spaceId: string) => Promise<{ spaceId: string; userId: string; reason: string | null; bannedBy: string; createdAt: number; user: any; moderator: any }[]>;
    ban: (spaceId: string, userId: string, reason?: string) => Promise<{ success: boolean }>;
    unban: (spaceId: string, userId: string) => Promise<{ success: boolean }>;
    transferOwnership: (spaceId: string, newOwnerId: string) => Promise<Space>;
    invitePreview: (code: string) => Promise<InvitePreview>;
  };

  readonly channels: {
    list: (spaceId: string) => Promise<Channel[]>;
    create: (spaceId: string, data: CreateChannelRequest) => Promise<Channel>;
    update: (id: string, data: UpdateChannelRequest) => Promise<Channel>;
    delete: (id: string) => Promise<{ success: boolean }>;
    messages: (id: string, before?: string, limit?: number) => Promise<MessageWithUser[]>;
    messagesAround: (id: string, messageId: string) => Promise<MessageWithUser[]>;
    sendMessage: (channelId: string, data: CreateMessageRequest) => Promise<MessageWithUser>;
    getOverrides: (channelId: string) => Promise<{ channelId: string; targetType: string; targetId: string; allow: string; deny: string }[]>;
    putOverride: (channelId: string, data: { targetType: string; targetId: string; allow: string; deny: string }) => Promise<{ success: boolean }>;
    deleteOverride: (channelId: string, targetType: string, targetId: string) => Promise<{ success: boolean }>;
    updateLayout: (spaceId: string, data: { channels: Array<{ id: string; position: number; categoryId: string | null }>; categories: Array<{ id: string; position: number }> }) => Promise<{ success: boolean }>;
  };

  readonly categories: {
    create: (spaceId: string, name: string) => Promise<ChannelCategory>;
    update: (id: string, data: { name?: string; position?: number }) => Promise<ChannelCategory>;
    delete: (id: string) => Promise<{ success: boolean }>;
    getOverrides: (categoryId: string) => Promise<{ categoryId: string; targetType: string; targetId: string; allow: string; deny: string }[]>;
    putOverride: (categoryId: string, data: { targetType: string; targetId: string; allow: string; deny: string }) => Promise<{ success: boolean }>;
    deleteOverride: (categoryId: string, targetType: string, targetId: string) => Promise<{ success: boolean }>;
  };

  readonly messages: {
    update: (id: string, data: UpdateMessageRequest) => Promise<MessageWithUser>;
    delete: (id: string) => Promise<{ success: boolean }>;
  };

  readonly uploads: {
    url: (filename: string) => string;
  };

  readonly dm: {
    list: () => Promise<DmChannel[]>;
    create: (data: CreateDmRequest) => Promise<DmChannel>;
    createGroup: (data: CreateGroupDmRequest) => Promise<DmChannel>;
    close: (id: string) => Promise<{ success: boolean }>;
    messages: (id: string, before?: string, limit?: number) => Promise<DmMessageWithUser[]>;
    messagesAround: (id: string, messageId: string) => Promise<DmMessageWithUser[]>;
    sendMessage: (id: string, data: CreateDmMessageRequest) => Promise<DmMessageWithUser>;
    updateMessage: (id: string, data: UpdateMessageRequest) => Promise<DmMessageWithUser>;
    deleteMessage: (id: string) => Promise<{ success: boolean }>;
    addMember: (dmChannelId: string, data: AddDmMemberRequest) => Promise<DmChannel>;
    leave: (dmChannelId: string) => Promise<{ success: boolean }>;
    /**
     * Owner-only: rename a group DM and/or update its icon.
     * Routes via getApiForOrigin(getOwnerInstanceForDm(channelId)) so the
     * federation event's sourceInstance equals the channel's ownerHomeInstance
     * (required by the receiver's authority check).
     */
    updateMetadata: (channelId: string, body: { name?: string | null; icon?: string | null }) => Promise<DmChannel>;
    /**
     * Owner-only: kick a member from a group DM.
     *
     * Routes via getApiForOrigin(getOwnerInstanceForDm(channelId)) — see
     * updateMetadata. The optional `federated` arg is required when the
     * target is a federated user: the channel-serving instance and the
     * owner-serving instance disagree on the local replicated user id, and
     * the home view surfaced through `userViews` carries the home id, not
     * the owner instance's local id. When `federated` is supplied, the
     * server resolves it via `resolveOrCreateReplicatedUser`. Without it,
     * `targetUserId` is treated as a local id on the owner instance.
     */
    kickMember: (
      channelId: string,
      targetUserId: string,
      federated?: { homeUserId: string; homeInstance: string },
    ) => Promise<{ success: boolean }>;
    /**
     * Owner-only: transfer group DM ownership to another member without leaving.
     *
     * Routes via getApiForOrigin(getOwnerInstanceForDm(channelId)) — see
     * updateMetadata. The optional `federated` arg is required for
     * federated targets, mirroring `kickMember`. When supplied, the server
     * uses `resolveOrCreateReplicatedUser(homeUserId, homeInstance)` to
     * find the local user row. Without it, `newOwnerId` is treated as a
     * local id on the owner instance.
     */
    transferOwnership: (
      channelId: string,
      newOwnerId: string,
      federated?: { homeUserId: string; homeInstance: string },
    ) => Promise<DmChannel>;
    spaceInvite: (body: SpaceInviteRequest) => Promise<SpaceInviteResponse>;
  };

  readonly social: {
    friends: () => Promise<Friend[]>;
    requests: () => Promise<FriendRequest[]>;
    sendRequest: (username: string) => Promise<{ success: boolean; requestId?: string }>;
    updateRequest: (id: string, status: 'accepted' | 'declined') => Promise<{ success: boolean }>;
    removeFriend: (id: string) => Promise<{ success: boolean }>;
    cancelRequest: (id: string) => Promise<{ success: boolean }>;
    search: (q: string) => Promise<User[]>;
    discover: (q?: string, limit?: number, offset?: number) => Promise<{ users: DiscoverUser[]; total: number }>;
  };

  readonly livekit: {
    token: (channelId: string) => Promise<LiveKitTokenResponse>;
    dmToken: (dmChannelId: string) => Promise<LiveKitTokenResponse>;
  };

  readonly settings: {
    getStreaming: () => Promise<InstanceStreamingLimits>;
    updateStreaming: (data: Partial<InstanceStreamingLimits>) => Promise<InstanceStreamingLimits>;
    getInstance: () => Promise<InstanceAdminSettings>;
    updateInstance: (data: Partial<InstanceAdminSettings>) => Promise<InstanceAdminSettings>;
  };

  readonly instance: {
    info: () => Promise<InstanceInfoResponse>;
  };

  readonly roles: {
    create: (spaceId: string, data: { name: string; color?: string; permissions?: string }) => Promise<Role>;
    update: (spaceId: string, roleId: string, data: { name?: string; color?: string; position?: number; permissions?: string }) => Promise<Role>;
    delete: (spaceId: string, roleId: string) => Promise<{ success: boolean }>;
  };

  readonly search: {
    channel: (channelId: string, params: { q?: string; from?: string; has?: string; before?: string; after?: string; offset?: number; limit?: number }) => Promise<{ results: MessageWithUser[]; totalCount: number }>;
    dm: (dmChannelId: string, params: { q?: string; from?: string; has?: string; before?: string; after?: string; offset?: number; limit?: number }) => Promise<{ results: DmMessageWithUser[]; totalCount: number }>;
  };

  readonly explore: {
    list: (q?: string, limit?: number, offset?: number) => Promise<{ spaces: ExploreSpace[]; total: number; totalAll: number; discoveryEnabled: boolean }>;
    publicJoin: (spaceId: string) => Promise<SpaceWithChannelsAndMembers>;
    requestJoin: (spaceId: string, message?: string) => Promise<JoinRequest>;
    getJoinRequests: (spaceId: string, status?: string) => Promise<{ requests: JoinRequest[] }>;
    decideJoinRequest: (spaceId: string, requestId: string, action: 'accept' | 'decline') => Promise<JoinRequest>;
    myJoinRequests: (status?: string) => Promise<{ requests: JoinRequest[] }>;
  };

  readonly gif: {
    trending: (limit?: number, pos?: string) => Promise<{ results: GifResult[]; next: string }>;
    search: (q: string, limit?: number, pos?: string) => Promise<{ results: GifResult[]; next: string }>;
    enabled: () => Promise<{ enabled: boolean }>;
  };

  readonly federation: {
    initiatePeering: (data: { remoteOrigin: string }) => Promise<{ peer: FederationPeer; verified?: boolean }>;
    ensurePeered: (data: { remoteOrigin: string }) => Promise<{ peeringStatus: string; peerId?: string; error?: string }>;
    peers: () => Promise<{ peers: FederationPeer[] }>;
    resetEvents: () => Promise<FederationResetEventsResponse>;
    acknowledgeResetEvent: (origin: string) => Promise<{ success: boolean }>;
    revokePeer: (id: string) => Promise<{ success: boolean }>;
    resetPeer: (id: string) => Promise<{ success: boolean }>;
    recheckPeer: (id: string) => Promise<{ recovered: boolean; status: string }>;
    rotatePeerSecret: (id: string) => Promise<{ success: boolean; gracePeriodMs: number }>;
    updatePeer: (id: string, data: { autoRotateIntervalDays: number }) => Promise<{ peer: FederationPeer }>;
    deletePeerPermanently: (id: string) => Promise<{ success: boolean }>;
    approvalRequests: () => Promise<{ requests: ApprovalRequest[] }>;
    approveRequest: (id: string) => Promise<{ success: boolean; peer?: FederationPeer }>;
    denyRequest: (id: string) => Promise<{ success: boolean }>;
    peeringSubscriptions: () => Promise<{ subscriptions: PeeringSubscription[] }>;
    cancelPeeringSubscription: (id: string) => Promise<{ success: boolean }>;
    peeringNotifications: (unreadOnly?: boolean) => Promise<{ notifications: PeeringNotification[] }>;
    markPeeringNotificationRead: (id: string) => Promise<{ success: boolean }>;
    markAllPeeringNotificationsRead: () => Promise<{ success: boolean; count: number }>;
  };

  readonly invites: {
    list: (status?: 'active' | 'archived') => Promise<{ invites: InviteLinkSummary[] }>;
    create: (body: CreateInviteRequest) => Promise<InviteLinkSummary>;
    update: (id: string, body: UpdateInviteRequest) => Promise<InviteLinkSummary>;
    revoke: (id: string) => Promise<{ invite: InviteLinkSummary }>;
    reinstate: (id: string, body: ReinstateInviteRequest) => Promise<ReinstateInviteResponse>;
    delete: (id: string) => Promise<{ success: boolean }>;
    redemptions: (id: string) => Promise<{ redemptions: InviteRedemption[] }>;
  };

  readonly ai: {
    status: () => Promise<{ configured: boolean; remaining: number }>;
    chat: (message: string) => Promise<AIChatClientResult>;
    support: (message: string) => Promise<AIChatClientResult>;
    reset: (scope?: 'assistant' | 'support') => Promise<{ ok: boolean }>;
  };

  readonly suggestions: {
    create: (text: string) => Promise<{ suggestion: UserSuggestion }>;
    mine: () => Promise<{ suggestions: UserSuggestion[] }>;
    // Admin
    list: () => Promise<{ suggestions: UserSuggestion[] }>;
    updateStatus: (id: string, status: 'read' | 'approved' | 'rejected') => Promise<{ suggestion: UserSuggestion }>;
  };

  readonly admin: {
    storageStats: () => Promise<StorageStats>;
    storageOrphans: () => Promise<{ orphans: OrphanedFile[] }>;
    storageCleanup: (dryRun?: boolean) => Promise<CleanupResult>;
    cleanupOldMedia: (maxAgeDays: number, dryRun?: boolean) => Promise<CleanupResult>;
    cleanupTusSessions: (maxAgeHours: number, dryRun?: boolean) => Promise<CleanupResult>;
    listUsers: (params?: { q?: string; page?: number; pageSize?: number; showDeleted?: boolean; homeInstance?: string; role?: string; joinedAfter?: string; joinedBefore?: string; sort?: string }) => Promise<AdminUserListResponse>;
    listInstances: () => Promise<{ instances: string[] }>;
    setUserRole: (userId: string, isAdmin: boolean) => Promise<AdminUser>;
    resetUserPassword: (userId: string) => Promise<AdminResetPasswordResponse>;
    deleteUser: (userId: string) => Promise<{ success: boolean }>;
  };

  readonly adminCenter: {
    summary: () => Promise<AdminCenterSummary>;
    users: (params?: { q?: string; filter?: string; presence?: string; sort?: string; page?: number; pageSize?: number }) => Promise<AdminCenterUsersResponse>;
    userDetail: (userId: string) => Promise<AdminCenterUserDetail>;
    netrex: (params?: { q?: string; filter?: string; page?: number; pageSize?: number }) => Promise<AdminCenterUsersResponse>;
    grantNetrex: (userId: string, body: NetrexGrantRequest) => Promise<NetrexStatusResult>;
    revokeNetrex: (userId: string) => Promise<NetrexStatusResult>;
    staff: () => Promise<{ staff: StaffMember[] }>;
    assignStaff: (userId: string, role: StaffRole) => Promise<StaffAssignResult>;
    changeStaffRole: (userId: string, role: StaffRole) => Promise<{ success: boolean }>;
    removeStaff: (userId: string) => Promise<{ success: boolean }>;
    moderate: (userId: string, body: ModerationRequest) => Promise<ModerationResult>;
    auditLog: (params?: { q?: string; action?: string; actor?: string; from?: number; to?: number; page?: number; pageSize?: number }) => Promise<AuditLogResponse>;
    spaces: (params?: { q?: string; sort?: string; visibility?: string; page?: number; pageSize?: number }) => Promise<AdminCenterSpacesResponse>;
    spaceDetail: (spaceId: string) => Promise<AdminCenterSpaceDetail>;
    activity: () => Promise<AdminCenterActivityResponse>;
  };

  constructor(baseUrl: string, getToken: () => string | null, onUnauthorized?: () => void) {
    async function request<T>(
      method: string,
      path: string,
      body?: unknown,
      requireAuth = true,
    ): Promise<T> {
      const headers: Record<string, string> = {};

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      if (requireAuth) {
        const token = getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      // AI endpoints can take >30s (PRO model, chain fallbacks) — give them
      // a longer window. Everything else keeps the 30s default.
      const isAI = path.startsWith('/ai/');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), isAI ? 90000 : 30000);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('Request timed out');
        }
        // Network-level failure (server down, DNS, proxy refused): surface a
        // recognisable error type so UIs can say "cannot reach the server"
        // instead of the browser's raw "Failed to fetch".
        throw new NetworkError();
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 && requireAuth && onUnauthorized) {
          onUnauthorized();
        }
        if (response.status === 429) {
          const body = await response.json().catch(() => ({}));
          const retryAfter = (body as { retryAfter?: number }).retryAfter
            ?? (parseInt(response.headers.get('retry-after') || '', 10) || 60);
          throw new RateLimitError(retryAfter);
        }
        const error = await response.json().catch(() => ({}));
        // 5xx (typically the dev proxy failing to reach the backend) or a body
        // without any error text means the server itself is unreachable —
        // surface NetworkError so UIs show "cannot reach the server".
        // 5xx means the server WAS reached (a real network failure throws
        // before this line). Only treat it as "unreachable" when the body
        // carries no JSON error (dev proxy down, raw HTML crash page). With a
        // structured body (e.g. Vertex AI "saturated" 503) surface the
        // server's honest message instead of the lying "Cannot reach the
        // server".
        if (response.status >= 500) {
          const errObj = error as { error?: unknown; message?: unknown };
          const hasErrorBody = typeof errObj.error === 'string' || typeof errObj.message === 'string';
          if (!hasErrorBody) throw new NetworkError();
          throw new HttpError(
            response.status,
            typeof errObj.message === 'string' ? errObj.message : (errObj.error as string),
            error,
          );
        }
        throw new HttpError(response.status, (error as { error?: string }).error || `HTTP ${response.status}`, error);
      }

      return response.json() as Promise<T>;
    }

    this.auth = {
      register: (data: RegisterRequest) =>
        request<AuthResponse>('POST', '/auth/register', data, false),
      login: (data: LoginRequest) =>
        request<AuthResponse>('POST', '/auth/login', data, false),
      checkUsername: (username: string) =>
        request<{ available: boolean; reason?: string }>('GET', `/auth/check-username?username=${encodeURIComponent(username)}`, undefined, false),
      checkInvite: (token: string) =>
        request<CheckInviteResponse>('GET', `/auth/check-invite?token=${encodeURIComponent(token)}`, undefined, false),
      attachProof: (targetDomain: string) =>
        request<AttachProofResponse>('POST', '/auth/attach-proof', { targetDomain }),
    };

    this.users = {
      me: () => request<User>('GET', '/users/@me'),
      update: (data: UpdateUserRequest) => request<User>('PATCH', '/users/@me', data),
      get: (id: string) => request<User>('GET', `/users/${id}`),
      verifyPassword: (password: string) =>
        request<VerifyPasswordResponse>('POST', '/users/@me/verify-password', { password }),
      changePassword: (data: ChangePasswordRequest) =>
        request<ChangePasswordResponse>('POST', '/users/@me/change-password', data),
      deleteAccount: (data: DeleteAccountRequest) =>
        request<{ success: boolean }>('DELETE', '/users/@me', data),
      getMutuals: (id: string, homeUserId?: string) => {
        const params = new URLSearchParams();
        if (homeUserId) params.set('homeUserId', homeUserId);
        const qs = params.toString();
        return request<{ mutualFriends: User[]; mutualSpaces: { id: string; name: string; icon: string | null; avatarColor: string | null }[] }>(
          'GET', `/users/${id}/mutuals${qs ? `?${qs}` : ''}`
        );
      },
      getFederationRegistry: () =>
        request<{ registry: FederationRegistryEntry[]; updatedAt: number }>(
          'GET', '/users/@me/federation-registry'
        ),
      putFederationRegistry: (data: { registry: FederationRegistryEntry[]; updatedAt: number }) =>
        request<{ ok: boolean; updatedAt: number }>(
          'PUT', '/users/@me/federation-registry', data
        ),
      deleteFederationIdentity: (data: FederationIdentityDeleteRequest) =>
        request<FederationIdentityDeleteResponse>(
          'POST', '/users/@me/federation-identity/delete', data
        ),
      reattach: (data: ReattachRequest) =>
        request<ReattachResponse>('POST', '/users/@me/reattach', data),
      saveBoard: (widgets: unknown[]) =>
        request<{ widgets: unknown[] }>('PUT', '/users/@me/board', { widgets }),
    };

    this.spaceLayout = {
      update: (data) =>
        request<{ items: SpaceLayoutItem[]; folders: SpaceFolder[]; updatedAt?: number }>('PUT', '/users/@me/space-layout', data),
    };

    this.spaces = {
      list: () => request<Space[]>('GET', '/spaces'),
      get: (id: string) => request<SpaceWithChannelsAndMembers>('GET', `/spaces/${id}`),
      create: (data: CreateSpaceRequest) => request<Space>('POST', '/spaces', data),
      update: (id: string, data: UpdateSpaceRequest) => request<Space>('PATCH', `/spaces/${id}`, data),
      delete: (id: string) => request<{ success: boolean }>('DELETE', `/spaces/${id}`),
      invite: (id: string) => request<{ inviteCode: string }>('POST', `/spaces/${id}/invite`),
      join: (id: string, data: JoinSpaceRequest) => request<Space>('POST', `/spaces/${id}/join`, data),
      joinByCode: (inviteCode: string) => request<Space>('POST', '/spaces/join', { inviteCode }),
      members: (id: string) => request<MemberWithUser[]>('GET', `/spaces/${id}/members`),
      updateMember: (spaceId: string, userId: string, data: UpdateMemberRequest) =>
        request<MemberWithUser>('PATCH', `/spaces/${spaceId}/members/${userId}`, data),
      removeMember: (spaceId: string, userId: string) =>
        request<{ success: boolean }>('DELETE', `/spaces/${spaceId}/members/${userId}`),
      getBans: (spaceId: string) =>
        request<any[]>('GET', `/spaces/${spaceId}/bans`),
      ban: (spaceId: string, userId: string, reason?: string) =>
        request<{ success: boolean }>('POST', `/spaces/${spaceId}/bans`, { userId, reason }),
      unban: (spaceId: string, userId: string) =>
        request<{ success: boolean }>('DELETE', `/spaces/${spaceId}/bans/${userId}`),
      transferOwnership: (spaceId: string, newOwnerId: string) =>
        request<Space>('PATCH', `/spaces/${spaceId}/transfer-ownership`, { newOwnerId }),
      invitePreview: (code: string) =>
        request<InvitePreview>('GET', `/spaces/invite/${encodeURIComponent(code)}/preview`, undefined, false),
    };

    this.channels = {
      list: (spaceId: string) => request<Channel[]>('GET', `/spaces/${spaceId}/channels`),
      create: (spaceId: string, data: CreateChannelRequest) =>
        request<Channel>('POST', `/spaces/${spaceId}/channels`, data),
      update: (id: string, data: UpdateChannelRequest) => request<Channel>('PATCH', `/channels/${id}`, data),
      delete: (id: string) => request<{ success: boolean }>('DELETE', `/channels/${id}`),
      messages: (id: string, before?: string, limit = 50) => {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        params.set('limit', String(limit));
        return request<MessageWithUser[]>('GET', `/channels/${id}/messages?${params}`);
      },
      messagesAround: (id: string, messageId: string) => {
        const params = new URLSearchParams();
        params.set('messageId', messageId);
        return request<MessageWithUser[]>('GET', `/channels/${id}/messages/around?${params}`);
      },
      sendMessage: (channelId: string, data: CreateMessageRequest) =>
        request<MessageWithUser>('POST', `/channels/${channelId}/messages`, data),
      getOverrides: (channelId: string) =>
        request<{ channelId: string; targetType: string; targetId: string; allow: string; deny: string }[]>(
          'GET', `/channels/${channelId}/overrides`
        ),
      putOverride: (channelId: string, data: { targetType: string; targetId: string; allow: string; deny: string }) =>
        request<{ success: boolean }>('PUT', `/channels/${channelId}/overrides`, data),
      deleteOverride: (channelId: string, targetType: string, targetId: string) =>
        request<{ success: boolean }>('DELETE', `/channels/${channelId}/overrides/${targetType}/${targetId}`),
      updateLayout: (spaceId: string, data: { channels: Array<{ id: string; position: number; categoryId: string | null }>; categories: Array<{ id: string; position: number }> }) =>
        request<{ success: boolean }>('PATCH', `/spaces/${spaceId}/channel-layout`, data),
    };

    this.categories = {
      create: (spaceId: string, name: string) =>
        request<ChannelCategory>('POST', `/spaces/${spaceId}/categories`, { name }),
      update: (id: string, data: { name?: string; position?: number }) =>
        request<ChannelCategory>('PATCH', `/categories/${id}`, data),
      delete: (id: string) =>
        request<{ success: boolean }>('DELETE', `/categories/${id}`),
      getOverrides: (categoryId: string) =>
        request<{ categoryId: string; targetType: string; targetId: string; allow: string; deny: string }[]>(
          'GET', `/categories/${categoryId}/overrides`
        ),
      putOverride: (categoryId: string, data: { targetType: string; targetId: string; allow: string; deny: string }) =>
        request<{ success: boolean }>('PUT', `/categories/${categoryId}/overrides`, data),
      deleteOverride: (categoryId: string, targetType: string, targetId: string) =>
        request<{ success: boolean }>('DELETE', `/categories/${categoryId}/overrides/${targetType}/${targetId}`),
    };

    this.messages = {
      update: (id: string, data: UpdateMessageRequest) => request<MessageWithUser>('PATCH', `/messages/${id}`, data),
      delete: (id: string) => request<{ success: boolean }>('DELETE', `/messages/${id}`),
    };

    this.uploads = {
      url: (filename: string) => `${baseUrl}/uploads/${filename}`,
    };

    this.dm = {
      list: () => request<DmChannel[]>('GET', '/dm'),
      create: (data: CreateDmRequest) => request<DmChannel>('POST', '/dm', data),
      createGroup: (data: CreateGroupDmRequest) => request<DmChannel>('POST', '/dm/group', data),
      close: (id: string) => request<{ success: boolean }>('DELETE', `/dm/${id}`),
      messages: (id: string, before?: string, limit = 50) => {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        params.set('limit', String(limit));
        return request<DmMessageWithUser[]>('GET', `/dm/${id}/messages?${params}`);
      },
      messagesAround: (id: string, messageId: string) => {
        const params = new URLSearchParams();
        params.set('messageId', messageId);
        return request<DmMessageWithUser[]>('GET', `/dm/${id}/messages/around?${params}`);
      },
      sendMessage: (id: string, data: CreateDmMessageRequest) =>
        request<DmMessageWithUser>('POST', `/dm/${id}/messages`, data),
      updateMessage: (id: string, data: UpdateMessageRequest) =>
        request<DmMessageWithUser>('PATCH', `/dm/messages/${id}`, data),
      deleteMessage: (id: string) =>
        request<{ success: boolean }>('DELETE', `/dm/messages/${id}`),
      addMember: (dmChannelId: string, data: AddDmMemberRequest) =>
        request<DmChannel>('POST', `/dm/${dmChannelId}/members`, data),
      leave: (dmChannelId: string) =>
        request<{ success: boolean }>('DELETE', `/dm/${dmChannelId}/members`),
      // Owner-only methods. Each first re-routes through the owner's home
      // instance via getApiForOrigin(getOwnerInstanceForDm(channelId)). When
      // the resolved client is `this`, we fall through to the local request
      // (terminating the recursion). When it's a different client (i.e. a
      // remote BackspaceApiClient), we delegate to that client's identical
      // method, which will see itself as `this` and execute the request.
      // This keeps the federation event's sourceInstance equal to the
      // channel's current ownerHomeInstance — required by receiver authority
      // checks (see docs/systems/federation.md and the kick-authority test).
      updateMetadata: (channelId, body) => {
        const target = getApiForOrigin(getOwnerInstanceForDm(channelId));
        if (target !== this) return target.dm.updateMetadata(channelId, body);
        return request<DmChannel>('PATCH', `/dm/${channelId}`, body);
      },
      kickMember: (channelId, targetUserId, federated) => {
        const target = getApiForOrigin(getOwnerInstanceForDm(channelId));
        if (target !== this) return target.dm.kickMember(channelId, targetUserId, federated);
        // For federated targets, the URL segment carries the homeUserId and
        // the `homeInstance` query string signals federated resolution. The
        // server route resolves via `resolveOrCreateReplicatedUser`. For
        // local targets, the URL segment is the local user id (legacy form)
        // and no query is appended.
        if (federated) {
          const homeId = encodeURIComponent(federated.homeUserId);
          const homeInst = encodeURIComponent(federated.homeInstance);
          return request<{ success: boolean }>(
            'DELETE',
            `/dm/${channelId}/members/${homeId}?homeInstance=${homeInst}`,
          );
        }
        return request<{ success: boolean }>('DELETE', `/dm/${channelId}/members/${targetUserId}`);
      },
      transferOwnership: (channelId, newOwnerId, federated) => {
        const target = getApiForOrigin(getOwnerInstanceForDm(channelId));
        if (target !== this) return target.dm.transferOwnership(channelId, newOwnerId, federated);
        const body: TransferOwnershipRequest = federated
          ? { homeUserId: federated.homeUserId, homeInstance: federated.homeInstance }
          : { newOwnerId };
        return request<DmChannel>('POST', `/dm/${channelId}/transfer`, body);
      },
      spaceInvite: (body) =>
        request<SpaceInviteResponse>('POST', '/dm/space-invite', body),
    };

    this.social = {
      friends: () => request<Friend[]>('GET', '/social/friends'),
      requests: () => request<FriendRequest[]>('GET', '/social/requests'),
      sendRequest: (username: string) => request<{ success: boolean; requestId?: string }>('POST', '/social/requests', { username }),
      updateRequest: (id: string, status: 'accepted' | 'declined') =>
        request<{ success: boolean }>('PATCH', `/social/requests/${id}`, { status }),
      removeFriend: (id: string) => request<{ success: boolean }>('DELETE', `/social/friends/${id}`),
      cancelRequest: (id: string) => request<{ success: boolean }>('DELETE', `/social/requests/${id}`),
      search: (q: string) => request<User[]>('GET', `/social/search?q=${encodeURIComponent(q)}`),
      discover: (q?: string, limit = 24, offset = 0) => {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        return request<{ users: DiscoverUser[]; total: number }>('GET', `/social/discover?${params}`);
      },
    };

    this.livekit = {
      token: (channelId: string) =>
        request<LiveKitTokenResponse>('POST', '/livekit/token', { channelId }),
      dmToken: (dmChannelId: string) =>
        request<LiveKitTokenResponse>('POST', '/livekit/token', { dmChannelId }),
    };

    this.settings = {
      getStreaming: () => request<InstanceStreamingLimits>('GET', '/settings/streaming'),
      updateStreaming: (data: Partial<InstanceStreamingLimits>) =>
        request<InstanceStreamingLimits>('PATCH', '/settings/streaming', data),
      getInstance: () => request<InstanceAdminSettings>('GET', '/settings/instance'),
      updateInstance: (data: Partial<InstanceAdminSettings>) =>
        request<InstanceAdminSettings>('PATCH', '/settings/instance', data),
    };

    this.instance = {
      info: () => request<InstanceInfoResponse>('GET', '/instance/info', undefined, false),
    };

    this.roles = {
      create: (spaceId: string, data: { name: string; color?: string; permissions?: string }) =>
        request<Role>('POST', `/spaces/${spaceId}/roles`, data),
      update: (spaceId: string, roleId: string, data: { name?: string; color?: string; position?: number; permissions?: string }) =>
        request<Role>('PATCH', `/spaces/${spaceId}/roles/${roleId}`, data),
      delete: (spaceId: string, roleId: string) =>
        request<{ success: boolean }>('DELETE', `/spaces/${spaceId}/roles/${roleId}`),
    };

    this.search = {
      channel: (channelId: string, params: { q?: string; from?: string; has?: string; before?: string; after?: string; offset?: number; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.from) qs.set('from', params.from);
        if (params.has) qs.set('has', params.has);
        if (params.before) qs.set('before', params.before);
        if (params.after) qs.set('after', params.after);
        if (params.offset !== undefined) qs.set('offset', String(params.offset));
        if (params.limit !== undefined) qs.set('limit', String(params.limit));
        return request<{ results: MessageWithUser[]; totalCount: number }>('GET', `/channels/${channelId}/search?${qs}`);
      },
      dm: (dmChannelId: string, params: { q?: string; from?: string; has?: string; before?: string; after?: string; offset?: number; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.from) qs.set('from', params.from);
        if (params.has) qs.set('has', params.has);
        if (params.before) qs.set('before', params.before);
        if (params.after) qs.set('after', params.after);
        if (params.offset !== undefined) qs.set('offset', String(params.offset));
        if (params.limit !== undefined) qs.set('limit', String(params.limit));
        return request<{ results: DmMessageWithUser[]; totalCount: number }>('GET', `/dm/${dmChannelId}/search?${qs}`);
      },
    };

    this.explore = {
      list: (q?: string, limit = 50, offset = 0) => {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        return request<{ spaces: ExploreSpace[]; total: number; totalAll: number; discoveryEnabled: boolean }>(
          'GET', `/spaces/explore?${params}`
        );
      },
      publicJoin: (spaceId: string) =>
        request<SpaceWithChannelsAndMembers>('POST', `/spaces/${spaceId}/public-join`),
      requestJoin: (spaceId: string, message?: string) =>
        request<JoinRequest>('POST', `/spaces/${spaceId}/request-join`, message ? { message } : {}),
      getJoinRequests: (spaceId: string, status?: string) => {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        return request<{ requests: JoinRequest[] }>('GET', `/spaces/${spaceId}/join-requests?${params}`);
      },
      decideJoinRequest: (spaceId: string, requestId: string, action: 'accept' | 'decline') =>
        request<JoinRequest>('PATCH', `/spaces/${spaceId}/join-requests/${requestId}`, { action }),
      myJoinRequests: (status?: string) => {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        return request<{ requests: JoinRequest[] }>('GET', `/users/@me/join-requests?${params}`);
      },
    };

    this.gif = {
      trending: (limit = 30, pos?: string) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (pos) params.set('pos', pos);
        return request<{ results: GifResult[]; next: string }>('GET', `/gif/trending?${params}`);
      },
      search: (q: string, limit = 30, pos?: string) => {
        const params = new URLSearchParams();
        params.set('q', q);
        params.set('limit', String(limit));
        if (pos) params.set('pos', pos);
        return request<{ results: GifResult[]; next: string }>('GET', `/gif/search?${params}`);
      },
      enabled: () => request<{ enabled: boolean }>('GET', '/gif/enabled'),
    };

    this.federation = {
      initiatePeering: (data: { remoteOrigin: string }) =>
        request<{ peer: FederationPeer; verified?: boolean }>(
          'POST', '/federation/peer/initiate', data
        ),
      ensurePeered: (data: { remoteOrigin: string }) =>
        request<{ peeringStatus: string; peerId?: string; error?: string }>(
          'POST', '/federation/peer/ensure', data
        ),
      peers: () =>
        request<{ peers: FederationPeer[] }>(
          'GET', '/federation/peers'
        ),
      resetEvents: () =>
        request<FederationResetEventsResponse>('GET', '/federation/reset-events'),
      acknowledgeResetEvent: (origin: string) =>
        request<{ success: boolean }>('POST', '/federation/reset-events/acknowledge', { origin }),
      revokePeer: (id: string) =>
        request<{ success: boolean }>('DELETE', `/federation/peers/${id}`),
      resetPeer: (id: string) =>
        request<{ success: boolean }>('POST', `/federation/peers/${id}/reset`),
      recheckPeer: (id: string) =>
        request<{ recovered: boolean; status: string }>('POST', `/federation/peers/${id}/recheck`),
      rotatePeerSecret: (id: string) =>
        request<{ success: boolean; gracePeriodMs: number }>('POST', `/federation/peers/${id}/rotate`),
      updatePeer: (id: string, data: { autoRotateIntervalDays: number }) =>
        request<{ peer: FederationPeer }>('PATCH', `/federation/peers/${id}`, data),
      deletePeerPermanently: (id: string) =>
        request<{ success: boolean }>('DELETE', `/federation/peers/${id}/permanent`),
      approvalRequests: () =>
        request<{ requests: ApprovalRequest[] }>(
          'GET', '/federation/approval-requests'
        ),
      approveRequest: (id: string) =>
        request<{ success: boolean; peer?: FederationPeer }>(
          'POST', `/federation/approval-requests/${id}/approve`
        ),
      denyRequest: (id: string) =>
        request<{ success: boolean }>(
          'POST', `/federation/approval-requests/${id}/deny`
        ),
      peeringSubscriptions: () =>
        request<{ subscriptions: PeeringSubscription[] }>(
          'GET', '/federation/peering-subscriptions'
        ),
      cancelPeeringSubscription: (id: string) =>
        request<{ success: boolean }>(
          'DELETE', `/federation/peering-subscriptions/${id}`
        ),
      peeringNotifications: (unreadOnly = false) =>
        request<{ notifications: PeeringNotification[] }>(
          'GET',
          `/federation/peering-notifications${unreadOnly ? '?unread=1' : ''}`,
        ),
      markPeeringNotificationRead: (id: string) =>
        request<{ success: boolean }>(
          'POST', `/federation/peering-notifications/${id}/read`
        ),
      markAllPeeringNotificationsRead: () =>
        request<{ success: boolean; count: number }>(
          'POST', '/federation/peering-notifications/read-all'
        ),
    };

    this.invites = {
      list: (status: 'active' | 'archived' = 'active') =>
        request<{ invites: InviteLinkSummary[] }>('GET', `/admin/invites?status=${status}`),
      create: (body: CreateInviteRequest) =>
        request<InviteLinkSummary>('POST', '/admin/invites', body),
      update: (id: string, body: UpdateInviteRequest) =>
        request<InviteLinkSummary>('PATCH', `/admin/invites/${id}`, body),
      revoke: (id: string) =>
        request<{ invite: InviteLinkSummary }>('POST', `/admin/invites/${id}/revoke`),
      reinstate: (id: string, body: ReinstateInviteRequest) =>
        request<ReinstateInviteResponse>('POST', `/admin/invites/${id}/reinstate`, body),
      delete: (id: string) =>
        request<{ success: boolean }>('DELETE', `/admin/invites/${id}`),
      redemptions: (id: string) =>
        request<{ redemptions: InviteRedemption[] }>('GET', `/admin/invites/${id}/redemptions`),
    };

    // AI endpoints: the server replies with honest messages for quota/limit/
    // saturation (429/503) — unwrap them so the chat shows "estoy saturado,
    // prueba en un minuto" instead of a raw error class name.
    const aiChat = async (path: string, message: string): Promise<AIChatClientResult> => {
      try {
        return await request<{ ok: true; text: string; model: string; netrex: boolean; remaining: number }>('POST', path, { message });
      } catch (err) {
        const body = err instanceof HttpError ? (err.body as { message?: unknown } | undefined) : undefined;
        if (err instanceof HttpError && typeof body?.message === 'string') {
          return { ok: false, message: body.message, remaining: null };
        }
        throw err;
      }
    };

    this.ai = {
      status: () => request<{ configured: boolean; remaining: number }>('GET', '/ai/status'),
      chat: (message: string) => aiChat('/ai/chat', message),
      support: (message: string) => aiChat('/ai/support', message),
      reset: (scope = 'assistant') => request<{ ok: boolean }>('POST', '/ai/reset', { scope }),
    };

    this.suggestions = {
      create: (text: string) => request<{ suggestion: UserSuggestion }>('POST', '/suggestions', { text }),
      mine: () => request<{ suggestions: UserSuggestion[] }>('GET', '/suggestions/mine'),
      list: () => request<{ suggestions: UserSuggestion[] }>('GET', '/admin/suggestions'),
      updateStatus: (id, status) => request<{ suggestion: UserSuggestion }>('PATCH', `/admin/suggestions/${id}`, { status }),
    };

    this.admin = {
      storageStats: () => request<StorageStats>('GET', '/admin/storage/stats'),
      storageOrphans: () => request<{ orphans: OrphanedFile[] }>('GET', '/admin/storage/orphans'),
      storageCleanup: (dryRun = false) => request<CleanupResult>('POST', '/admin/storage/cleanup', { dryRun }),
      cleanupOldMedia: (maxAgeDays: number, dryRun = false) =>
        request<CleanupResult>('POST', '/admin/storage/cleanup-media', { maxAgeDays, dryRun }),
      cleanupTusSessions: (maxAgeHours: number, dryRun = false) =>
        request<CleanupResult>('POST', '/admin/storage/cleanup-tus', { maxAgeHours, dryRun }),
      listUsers: (params) => {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.page !== undefined) qs.set('page', String(params.page));
        if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
        if (params?.showDeleted) qs.set('showDeleted', 'true');
        if (params?.homeInstance) qs.set('homeInstance', params.homeInstance);
        if (params?.role) qs.set('role', params.role);
        if (params?.joinedAfter) qs.set('joinedAfter', params.joinedAfter);
        if (params?.joinedBefore) qs.set('joinedBefore', params.joinedBefore);
        if (params?.sort) qs.set('sort', params.sort);
        return request<AdminUserListResponse>('GET', `/admin/users?${qs}`);
      },
      listInstances: () => request<{ instances: string[] }>('GET', '/admin/users/instances'),
      setUserRole: (userId, isAdmin) =>
        request<AdminUser>('PATCH', `/admin/users/${userId}/role`, { isAdmin }),
      resetUserPassword: (userId) =>
        request<AdminResetPasswordResponse>('POST', `/admin/users/${userId}/reset-password`),
      deleteUser: (userId) =>
        request<{ success: boolean }>('DELETE', `/admin/users/${userId}`),
    };

    this.adminCenter = {
      summary: () => request<AdminCenterSummary>('GET', '/admin-center/summary'),
      users: (params) => {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.filter) qs.set('filter', params.filter);
        if (params?.presence) qs.set('presence', params.presence);
        if (params?.sort) qs.set('sort', params.sort);
        if (params?.page !== undefined) qs.set('page', String(params.page));
        if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
        return request<AdminCenterUsersResponse>('GET', `/admin-center/users?${qs}`);
      },
      userDetail: (userId) => request<AdminCenterUserDetail>('GET', `/admin-center/users/${userId}`),
      netrex: (params) => {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.filter) qs.set('filter', params.filter);
        if (params?.page !== undefined) qs.set('page', String(params.page));
        if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
        return request<AdminCenterUsersResponse>('GET', `/admin-center/netrex?${qs}`);
      },
      grantNetrex: (userId, body) =>
        request<NetrexStatusResult>('POST', `/admin-center/users/${userId}/netrex`, body),
      revokeNetrex: (userId) =>
        request<NetrexStatusResult>('POST', `/admin-center/users/${userId}/netrex/revoke`),
      staff: () => request<{ staff: StaffMember[] }>('GET', '/admin-center/staff'),
      assignStaff: (userId, role) =>
        request<StaffAssignResult>('POST', '/admin-center/staff', { userId, role }),
      changeStaffRole: (userId, role) =>
        request<{ success: boolean }>('PATCH', `/admin-center/staff/${userId}`, { role }),
      removeStaff: (userId) =>
        request<{ success: boolean }>('DELETE', `/admin-center/staff/${userId}`),
      moderate: (userId, body) =>
        request<ModerationResult>('POST', `/admin-center/users/${userId}/moderation`, body),
      auditLog: (params) => {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.action) qs.set('action', params.action);
        if (params?.actor) qs.set('actor', params.actor);
        if (params?.from !== undefined) qs.set('from', String(params.from));
        if (params?.to !== undefined) qs.set('to', String(params.to));
        if (params?.page !== undefined) qs.set('page', String(params.page));
        if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
        return request<AuditLogResponse>('GET', `/admin-center/audit-log?${qs}`);
      },
      spaces: (params) => {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.sort) qs.set('sort', params.sort);
        if (params?.visibility) qs.set('visibility', params.visibility);
        if (params?.page !== undefined) qs.set('page', String(params.page));
        if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
        return request<AdminCenterSpacesResponse>('GET', `/admin-center/spaces?${qs}`);
      },
      spaceDetail: (spaceId) => request<AdminCenterSpaceDetail>('GET', `/admin-center/spaces/${spaceId}`),
      activity: () => request<AdminCenterActivityResponse>('GET', '/admin-center/activity'),
    };
  }
}

function handleUnauthorized(): void {
  localStorage.removeItem('backspace_token');
  if (
    !window.location.pathname.startsWith('/login') &&
    !window.location.pathname.startsWith('/register')
  ) {
    window.location.href = '/login';
  }
}

export const api = new BackspaceApiClient(
  '/api',
  () => localStorage.getItem('backspace_token'),
  handleUnauthorized,
);

export function createApiClient(origin: string, getToken: () => string | null, onUnauthorized?: () => void): BackspaceApiClient {
  const baseUrl = origin ? `${origin}/api` : '/api';
  return new BackspaceApiClient(baseUrl, getToken, onUnauthorized);
}

