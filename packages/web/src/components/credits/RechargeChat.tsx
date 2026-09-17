import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useLanguage } from '../../contexts/LanguageContext';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useTransferStore } from '../../stores/transferStore';
import { attUrlOf } from '../chat/AttachmentRenderer';
import type {
  RechargeMessage,
  RechargeTicket,
  RechargeTicketWithMessages,
} from '@backspace/shared';

/**
 * Chat del ticket de recarga (flujo "Ya he pagado"):
 *  - burbujas estilo DM: mis mensajes a la derecha (tinte menta), staff a la
 *    izquierda, mensajes del sistema centrados;
 *  - 📎 adjunta una CAPTURA (jpg/png/webp, máx 5MB) reutilizando la subida tus
 *    existente de la app — el mensaje lleva el attachmentFilename resultante;
 *  - refresco periódico + al volver la pestaña para ver respuestas del staff;
 *  - estado visible: open (⏳), approved (✅ +créditos), rejected (con motivo).
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

export function RechargeChat({
  onResolved,
  onRefreshBalance,
  pollMs = 10000,
}: {
  /** Se llama cuando el ticket pasa a approved/rejected (para refrescar saldo). */
  onResolved?: () => void;
  onRefreshBalance?: () => void;
  /** Intervalo de polling (ms) — inyectable para tests. */
  pollMs?: number;
}) {
  const { t } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const myUserId = useAuthStore((s) => s.user?.id);
  const startUpload = useTransferStore((s) => s.startUpload);

  const [data, setData] = useState<RechargeTicketWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedRef = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Evita toasts duplicados por el poll: solo anunciamos transiciones nuevas.
  const lastKnownStatus = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.spaces.rechargeMy();
      setData(res);
      // Marca el chat como "visto" para el badge del chip del sidebar.
      localStorage.setItem('recharge_chat_last_seen', String(Date.now()));
      const status = res.ticket?.status ?? null;
      if (status && lastKnownStatus.current && status !== lastKnownStatus.current) {
        if (status === 'approved') {
          addToast(t('recharge_toast_approved'), 'success');
          onRefreshBalance?.();
        } else if (status === 'rejected') {
          addToast(t('recharge_toast_rejected'), 'warning');
        }
        if (status !== 'open') {
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            onResolved?.();
          }
        }
      }
      lastKnownStatus.current = status;
    } catch {
      // sin ticket / red — se reintenta en el próximo poll
    } finally {
      setLoading(false);
    }
  }, [addToast, t, onRefreshBalance, onResolved]);

  useEffect(() => {
    void refresh();
    // Poll: las respuestas del staff aparecen sin reabrir nada.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, pollMs]);

  // Autoscroll al último mensaje.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  const closeTicket = async () => {
    try {
      await api.spaces.rechargeClose();
      setConfirmClose(false);
      await refresh();
    } catch {
      addToast(t('recharge_err_close'), 'warning');
    }
  };

  const send = async (payload: { body?: string; imageUrl?: string }) => {
    setSending(true);
    try {
      const res = await api.spaces.rechargeSendMessage(payload);
      // Optimista: el mensaje enviado aparece al instante (el refresh trae
      // la lista canónica del server, con la respuesta del staff cuando llegue).
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      setDraft('');
      await refresh();
    } catch (err: unknown) {
      const code = (err as { body?: { code?: string } })?.body?.code;
      addToast(code === 'ticket_closed' ? t('recharge_err_closed') : t('recharge_err_send'), 'warning');
    } finally {
      setSending(false);
    }
  };

  const handleSendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    await send({ body: text });
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      addToast(t('recharge_err_image_type'), 'warning');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      addToast(t('recharge_err_image_size'), 'warning');
      return;
    }
    setUploading(true);
    try {
      const transferId = await startUpload(file, { tray: false });
      // La subida tus resuelve cuando el attachment ya tiene fila en la DB;
      // esperamos a que el transfer quede 'completed' con su filename.
      await new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          const transfer = useTransferStore.getState().get(transferId);
          if (transfer?.state === 'completed' && transfer.attachmentFilename) return resolve();
          if (transfer?.state === 'failed') {
            return reject(new Error(transfer.error?.message ?? 'upload failed'));
          }
          if (Date.now() - started > 60_000) return reject(new Error('upload timeout'));
          setTimeout(check, 250);
        };
        check();
      });
      const transfer = useTransferStore.getState().get(transferId);
      if (transfer?.attachmentFilename) {
        await send({ imageUrl: `/api/uploads/${transfer.attachmentFilename}` });
        useTransferStore.getState().remove(transferId);
      }
    } catch {
      addToast(t('recharge_err_upload'), 'warning');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return <p className="py-6 text-center text-[12px] text-txt-tertiary">{t('recharge_loading')}</p>;
  }

  const ticket: RechargeTicket | null = data?.ticket ?? null;
  const messages: RechargeMessage[] = data?.messages ?? [];

  if (!ticket) {
    return <p className="py-6 text-center text-[12px] text-txt-tertiary">{t('recharge_no_ticket')}</p>;
  }

  const isOpen = ticket.status === 'open';
  const packEuros = ticket.packId.replace('pack_', '');

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02]">
      {/* Estado del ticket */}
      <div
        className={`flex items-center gap-2 rounded-t-xl border-b border-white/[0.06] px-4 py-2.5 text-[12px] font-semibold ${
          ticket.status === 'approved'
            ? 'bg-accent-mint/10 text-accent-mint'
            : ticket.status === 'rejected'
              ? 'bg-accent-rose/10 text-accent-rose'
              : 'bg-white/[0.03] text-txt-secondary'
        }`}
      >
        <span aria-hidden="true">
          {ticket.status === 'approved' ? '✅' : ticket.status === 'rejected' ? '❌' : ticket.status === 'closed' ? '📁' : '⏳'}
        </span>
        <span>
          {ticket.status === 'approved'
            ? t('recharge_status_approved').replace('{credits}', String(packEuros === '2' ? 100 : packEuros === '5' ? 275 : 600))
            : ticket.status === 'rejected'
              ? t('recharge_status_rejected')
              : ticket.status === 'closed'
                ? t('recharge_status_closed')
                : t('recharge_status_open')}
        </span>
        <span className="ml-auto font-mono text-[10px] font-normal text-txt-tertiary">
          {t('recharge_pack_label').replace('{euros}', packEuros)}
        </span>
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="max-h-[300px] min-h-[160px] space-y-2 overflow-y-auto px-3 py-3 scrollbar-thin">
        {messages.map((m) => {
          if (m.senderRole === 'system') {
            const info = systemBody(m.body ?? '');
            return (
              <div key={m.id} className="flex justify-center">
                <div
                  className={`max-w-[85%] rounded-full px-3 py-1 text-center text-[11px] ${
                    info.kind === 'approved'
                      ? 'bg-accent-mint/15 text-accent-mint'
                      : info.kind === 'rejected'
                        ? 'bg-accent-rose/15 text-accent-rose'
                        : info.kind === 'closed'
                          ? 'bg-white/[0.07] text-txt-secondary'
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
          const mine = m.senderUserId === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                  mine
                    ? 'rounded-br-sm bg-accent-mint/20 text-txt-primary'
                    : 'rounded-bl-sm bg-white/[0.06] text-txt-secondary'
                }`}
              >
                {!mine && (
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-mint">
                    {t('recharge_staff_label')}
                  </div>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.imageUrl && (
                  <img
                    src={attUrlOf(m.imageUrl)}
                    alt={t('recharge_attachment_alt')}
                    className="mt-1.5 max-h-48 rounded-lg border border-white/10 object-contain"
                    loading="lazy"
                  />
                )}
                <div className={`mt-0.5 text-right text-[9.5px] text-txt-tertiary ${mine ? '' : 'text-left'}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer (solo con ticket abierto) + cierre por el usuario */}
      {isOpen && confirmClose ? (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span className="text-[11.5px] text-txt-secondary">{t('recharge_close_confirm')}</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void closeTicket()}
              className="rounded-lg border border-accent-rose/40 px-2.5 py-1.5 text-[11.5px] font-semibold text-accent-rose transition-colors hover:bg-accent-rose/10 motion-reduce:transition-none"
            >
              {t('recharge_close_yes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="px-2 py-1.5 text-[11.5px] text-txt-tertiary transition-colors hover:text-txt-secondary motion-reduce:transition-none"
            >
              {t('recharge_cancel')}
            </button>
          </div>
        </div>
      ) : isOpen ? (
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading || sending}
            className="p-1.5 text-txt-tertiary transition-colors hover:text-txt-primary disabled:opacity-40 motion-reduce:transition-none"
            title={t('recharge_attach_title')}
            aria-label={t('recharge_attach_title')}
          >
            {uploading ? (
              <span className="inline-block animate-spin motion-reduce:animate-none">⏳</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendText();
              }
            }}
            placeholder={t('recharge_input_placeholder')}
            maxLength={2000}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-tertiary focus:border-accent-mint/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSendText()}
            disabled={!draft.trim() || sending}
            className="rounded-lg bg-accent-mint px-3 py-2 text-[12px] font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 motion-reduce:transition-none"
          >
            {t('recharge_send')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmClose(true)}
            className="p-1.5 text-txt-tertiary transition-colors hover:text-accent-rose motion-reduce:transition-none"
            title={t('recharge_close_title')}
            aria-label={t('recharge_close_title')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="border-t border-white/[0.06] px-3 py-2 text-center text-[11px] text-txt-tertiary">
          {t('recharge_chat_closed_note')}
        </div>
      )}
    </div>
  );
}
