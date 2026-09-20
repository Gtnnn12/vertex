import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { attUrlOf } from '../chat/AttachmentRenderer';
import type {
  RechargeQueueTicket,
  RechargeTicket,
  RechargeTicketWithMessages,
} from '@backspace/shared';

/**
 * Admin Center — pestaña "Compras": bandeja de tickets de recarga.
 *  - Lista de tickets (abiertos por defecto; filtro para historial resuelto).
 *  - Al entrar: chat completo con el usuario (capturas incluidas).
 *  - Responder como staff, y Aprobar ✓ (acredita créditos vía wallet) o
 *    Rechazar ✗ con nota obligatoria.
 */

const PACK_CREDITS: Record<string, number> = { pack_2: 100, pack_5: 275, pack_10: 600 };

type QueueItem = RechargeQueueTicket;

function systemBody(body: string): { kind: 'created' | 'approved' | 'rejected' | 'closed'; note?: string } {
  if (body.startsWith('SYSTEM_APPROVED')) {
    return { kind: 'approved', note: body.slice('SYSTEM_APPROVED'.length + 1) || undefined };
  }
  if (body.startsWith('SYSTEM_REJECTED')) {
    return { kind: 'rejected', note: body.slice('SYSTEM_REJECTED'.length + 1) || undefined };
  }
  if (body.startsWith('SYSTEM_CLOSED')) {
    return { kind: 'closed', note: body.slice('SYSTEM_CLOSED'.length + 1) || undefined };
  }
  return { kind: 'created' };
}

function statusChipClass(status: string): string {
  if (status === 'open') return 'bg-amber-400/15 text-amber-300';
  if (status === 'approved') return 'bg-green-400/15 text-green-300';
  if (status === 'rejected') return 'bg-red-400/15 text-red-300';
  return 'bg-white/10 text-txt-secondary'; // closed
}

function statusIcon(status: string): string {
  if (status === 'open') return '⏳';
  if (status === 'approved') return '✓';
  if (status === 'rejected') return '✗';
  return '📁';
}

type QueueFilter = 'open' | 'approved' | 'rejected' | 'closed' | 'all';

const FILTERS: QueueFilter[] = ['open', 'approved', 'rejected', 'closed', 'all'];

export function AdminPurchases() {
  const { t } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const [filter, setFilter] = useState<QueueFilter>('open');
  const [tickets, setTickets] = useState<QueueItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(RechargeTicketWithMessages & { username: string }) | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showCloseNote, setShowCloseNote] = useState(false);
  const [closeNote, setCloseNote] = useState('');

  const loadQueue = useCallback(async () => {
    try {
      const res = await api.spaces.rechargeQueue(filter);
      setTickets(res.tickets);
    } catch {
      setTickets([]);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.spaces.rechargeTicket(id);
      setDetail(res);
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // Poll del chat abierto para ver mensajes nuevos del usuario.
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadDetail(selectedId);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedId, loadDetail]);

  const openTicket = (id: string) => {
    setSelectedId(id);
    setShowReject(false);
    setRejectNote('');
    setShowCloseNote(false);
    setCloseNote('');
    void loadDetail(id);
  };

  const sendReply = async () => {
    if (!detail || !draft.trim() || busy) return;
    setBusy(true);
    try {
      await api.spaces.rechargeReply(detail.ticket.id, { body: draft.trim() });
      setDraft('');
      await loadDetail(detail.ticket.id);
    } catch {
      addToast(t('admin_purchases_err_send'), 'warning');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (action: 'approve' | 'reject' | 'close') => {
    if (!detail || busy) return;
    if (action === 'reject' && !rejectNote.trim()) return;
    setBusy(true);
    try {
      const res =
        action === 'approve'
          ? await api.spaces.rechargeApprove(detail.ticket.id)
          : action === 'reject'
            ? await api.spaces.rechargeReject(detail.ticket.id, rejectNote.trim())
            : await api.spaces.rechargeAdminClose(detail.ticket.id, closeNote.trim() || undefined);
      setDetail({ ...res, username: detail.username });
      addToast(
        action === 'approve'
          ? t('admin_purchases_toast_approved')
          : action === 'reject'
            ? t('admin_purchases_toast_rejected')
            : t('admin_purchases_toast_closed'),
        'success',
      );
      setShowReject(false);
      setRejectNote('');
      setShowCloseNote(false);
      setCloseNote('');
      await loadQueue();
    } catch (err: unknown) {
      const code = (err as { body?: { code?: string } })?.body?.code;
      addToast(code === 'ticket_already_resolved' ? t('admin_purchases_err_resolved') : t('admin_purchases_err_resolve'), 'warning');
      await loadDetail(detail.ticket.id);
    } finally {
      setBusy(false);
    }
  };

  const openCount = tickets?.filter((tk) => tk.status === 'open').length ?? 0;

  const FILTER_LABELS: Record<QueueFilter, string> = {
    open: t('admin_purchases_filter_open'),
    approved: t('admin_purchases_filter_approved'),
    rejected: t('admin_purchases_filter_rejected'),
    closed: t('admin_purchases_filter_closed'),
    all: t('admin_purchases_filter_all'),
  };

  const showProfile = (e: React.MouseEvent, tk: QueueItem) => {
    e.stopPropagation();
    openUserProfile(
      {
        id: tk.userId,
        username: tk.username ?? tk.userId,
        displayName: tk.username ?? tk.userId,
        avatar: null,
        banner: null,
        accentColor: null,
        avatarColor: null,
        bio: null,
        status: 'offline' as const,
        customStatus: null,
        createdAt: tk.createdAt,
        homeUserId: null,
        homeInstance: null,
        isAdmin: false,
        replicatedInstances: [],
      },
      e.currentTarget.getBoundingClientRect(),
      'left',
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[15px] font-semibold text-txt-primary">{t('admin_purchases_title')}</h3>
        {openCount > 0 && (
          <span className="rounded-full bg-accent-mint px-2 py-0.5 font-mono text-[10px] font-bold text-black tabular-nums">
            {openCount}
          </span>
        )}
        <div className="ml-auto flex flex-wrap rounded-lg border border-white/10 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-md text-[11px] transition-colors motion-reduce:transition-none ${
                filter === f ? 'bg-white/10 text-txt-primary font-semibold' : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,300px)_1fr] gap-3">
        {/* Cola */}
        <div className="space-y-2 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
          {tickets === null && <p className="text-[12px] text-txt-tertiary">…</p>}
          {tickets?.length === 0 && (
            <p className="text-[12px] text-txt-tertiary py-4 text-center">{t('admin_purchases_empty')}</p>
          )}
          {tickets?.map((tk) => (
            <button
              key={tk.id}
              type="button"
              onClick={() => openTicket(tk.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none ${
                selectedId === tk.id
                  ? 'border-accent-mint/50 bg-accent-mint/[0.06]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => showProfile(e, tk)}
                  className="truncate text-[12.5px] font-semibold text-txt-primary underline-offset-2 hover:underline"
                  title={t('admin_purchases_view_profile')}
                >
                  {tk.username}
                </button>
                {/* Sin leer: el último mensaje es del usuario y nadie ha respondido después. */}
                {tk.lastMessageRole === 'user' && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                    title={t('admin_purchases_awaiting_reply')}
                    aria-label={t('admin_purchases_awaiting_reply')}
                  />
                )}
                <span
                  className={`ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${statusChipClass(tk.status)}`}
                >
                  {statusIcon(tk.status)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-txt-tertiary">
                <span className="font-mono">{tk.packId.replace('pack_', '')}€ → {PACK_CREDITS[tk.packId] ?? '?'} 💎</span>
                <span>·</span>
                <span>{new Date(tk.createdAt).toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detalle / chat */}
        <div>
          {!detail && (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-white/[0.06] text-[12px] text-txt-tertiary">
              {t('admin_purchases_pick_one')}
            </div>
          )}
          {detail && (
            <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02]">
              {/* Cabecera */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                <span className="text-[13px] font-semibold text-txt-primary">{detail.username}</span>
                <span className="font-mono text-[10.5px] text-txt-tertiary">
                  {detail.ticket.packId.replace('pack_', '')}€ → {PACK_CREDITS[detail.ticket.packId] ?? '?'} 💎
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-px text-[9.5px] font-bold uppercase ${statusChipClass(detail.ticket.status)}`}
                >
                  {detail.ticket.status}
                </span>
              </div>

              {/* Mensajes */}
              <div className="max-h-[320px] min-h-[180px] space-y-2 overflow-y-auto px-3 py-3 scrollbar-thin">
                {detail.messages.map((m) => {
                  if (m.senderRole === 'system') {
                    const info = systemBody(m.body ?? '');
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div
                          className={`max-w-[85%] rounded-full px-3 py-1 text-center text-[11px] ${
                            info.kind === 'approved'
                              ? 'bg-green-400/15 text-green-300'
                              : info.kind === 'rejected'
                                ? 'bg-red-400/15 text-red-300'
                                : 'bg-white/[0.05] text-txt-tertiary'
                          }`}
                        >
                  {info.kind === 'created' && t('recharge_system_created')}
                  {info.kind === 'approved' && t('recharge_system_approved')}
                  {info.kind === 'rejected' && `${t('recharge_system_rejected')}${info.note ? `: ${info.note}` : ''}`}
                  {info.kind === 'closed' && `${t('recharge_system_closed')}${info.note ? `: ${info.note}` : ''}`}
                </div>
                      </div>
                    );
                  }
                  const fromUser = m.senderRole === 'user';
                  return (
                    <div key={m.id} className={`flex ${fromUser ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                          fromUser
                            ? 'rounded-bl-sm bg-white/[0.06] text-txt-secondary'
                            : 'rounded-br-sm bg-accent-mint/20 text-txt-primary'
                        }`}
                      >
                        {!fromUser && (
                          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-mint">
                            {t('admin_purchases_you')}
                          </div>
                        )}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        {m.imageUrl && (
                          <a href={attUrlOf(m.imageUrl)} target="_blank" rel="noopener noreferrer">
                            <img
                              src={attUrlOf(m.imageUrl)}
                              alt={t('recharge_attachment_alt')}
                              className="mt-1.5 max-h-48 rounded-lg border border-white/10 object-contain"
                              loading="lazy"
                            />
                          </a>
                        )}
                        <div className={`mt-0.5 text-[9.5px] text-txt-tertiary ${fromUser ? '' : 'text-right'}`}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Responder (siempre disponible para el staff) */}
              <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  maxLength={2000}
                  placeholder={t('admin_purchases_reply_placeholder')}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-tertiary focus:border-accent-mint/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={!draft.trim() || busy}
                  className="rounded-lg bg-white/10 px-3 py-2 text-[12px] font-semibold text-txt-primary transition-opacity hover:bg-white/15 disabled:opacity-40 motion-reduce:transition-none"
                >
                  {t('recharge_send')}
                </button>
              </div>

              {/* Acciones de resolución */}
              {detail.ticket.status === 'open' && (
                <div className="border-t border-white/[0.06] px-3 py-2.5">
                  {!showReject && !showCloseNote ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void resolve('approve')}
                        disabled={busy}
                        className="flex-1 rounded-lg bg-accent-mint px-3 py-2 text-[12px] font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 motion-reduce:transition-none"
                      >
                        {t('admin_purchases_approve').replace('{credits}', String(PACK_CREDITS[detail.ticket.packId] ?? ''))}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        disabled={busy}
                        className="flex-1 rounded-lg border border-accent-rose/40 px-3 py-2 text-[12px] font-semibold text-accent-rose transition-colors hover:bg-accent-rose/10 disabled:opacity-40 motion-reduce:transition-none"
                      >
                        {t('admin_purchases_reject')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCloseNote(true)}
                        disabled={busy}
                        className="rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-txt-secondary transition-colors hover:bg-white/5 disabled:opacity-40 motion-reduce:transition-none"
                      >
                        {t('admin_purchases_close_ticket')}
                      </button>
                    </div>
                  ) : showReject ? (
                    <div className="space-y-2">
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        maxLength={500}
                        placeholder={t('admin_purchases_reject_note_placeholder')}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-txt-primary placeholder:text-txt-tertiary focus:border-accent-rose/50 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void resolve('reject')}
                          disabled={!rejectNote.trim() || busy}
                          className="flex-1 rounded-lg bg-accent-rose px-3 py-2 text-[12px] font-bold text-black disabled:opacity-40"
                        >
                          {t('admin_purchases_reject_confirm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReject(false)}
                          className="px-3 py-2 text-[12px] text-txt-tertiary hover:text-txt-secondary"
                        >
                          {t('recharge_cancel')}
                        </button>
                      </div>
                    </div>
                  ) : showCloseNote ? (
                    <div className="space-y-2">
                      <input
                        value={closeNote}
                        onChange={(e) => setCloseNote(e.target.value)}
                        maxLength={500}
                        placeholder={t('admin_purchases_close_note_placeholder')}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-txt-primary placeholder:text-txt-tertiary focus:border-white/30 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void resolve('close')}
                          disabled={busy}
                          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-bold text-txt-primary disabled:opacity-40"
                        >
                          {t('admin_purchases_close_confirm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCloseNote(false)}
                          className="px-3 py-2 text-[12px] text-txt-tertiary hover:text-txt-secondary"
                        >
                          {t('recharge_cancel')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
