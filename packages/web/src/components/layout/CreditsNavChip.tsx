import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../api/client';

/**
 * Chip del monedero de créditos en el sidebar (junto al chip NETREX):
 * saldo pequeño con icono 💎, click abre la tienda (modal creditsShop).
 * El saldo se carga al montar y se refresca cuando se cierra la tienda
 * (activeModal vuelve a null) — así una recarga o gasto se refleja al rato.
 *
 * Badge de compras: punto menta cuando hay mensajes sin leer del staff en el
 * chat del ticket de recarga (el contador vuelve a cero al abrir el chat).
 */
export function CreditsNavChip() {
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const [balance, setBalance] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.spaces.creditBalance()
      .then((res) => { if (!cancelled) setBalance(res.balance); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeModal]); // refresh when the shop modal closes

  // Poll del ticket: cuenta respuestas del staff (admin) más nuevas que la
  // última vez que el chat estuvo a la vista. RechargeChat actualiza
  // 'recharge_chat_last_seen' en cada refresh; aquí solo pasa al cerrar el
  // modal o al montar.
  useEffect(() => {
    if (activeModal === 'creditsShop') {
      setUnread(0); // el chat está a la vista → nada pendiente
      return;
    }
    let cancelled = false;
    const check = () => {
      api.spaces.rechargeMy()
        .then((res) => {
          if (cancelled || !res.ticket) return;
          // Ticket cerrado → nada pendiente de leer.
          if (res.ticket.status === 'closed') {
            setUnread(0);
            return;
          }
          const staffMsgs = res.messages.filter((m) => m.senderRole === 'admin');
          const lastSeenStr = localStorage.getItem('recharge_chat_last_seen');
          const lastSeen = lastSeenStr ? Number(lastSeenStr) : 0;
          setUnread(staffMsgs.filter((m) => m.createdAt > lastSeen).length);
        })
        .catch(() => undefined);
    };
    check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeModal]);

  // Mientras el modal esté abierto en la vista chat, también marca leído.
  useEffect(() => {
    if (activeModal === 'creditsShop' && useUIStore.getState().modalData?.shopView === 'chat') {
      localStorage.setItem('recharge_chat_last_seen', String(Date.now()));
    }
  }, [activeModal]);

  return (
    <button
      type="button"
      onClick={() => openModal('creditsShop')}
      className="w-[calc(100%-0px)] group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors motion-reduce:transition-none"
      title="credits"
      aria-label="credits"
    >
      <span aria-hidden="true" className="relative text-[13px] leading-none">
        💎
        {unread > 0 && (
          <span
            className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-black bg-accent-mint"
            title={String(unread)}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 text-left text-[12px] font-semibold text-txt-secondary group-hover:text-txt-primary tabular-nums">
        {balance ?? '…'}
      </span>
    </button>
  );
}
