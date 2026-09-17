import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../api/client';

/**
 * Chip del monedero de créditos en el sidebar (junto al chip NETREX):
 * saldo pequeño con icono 💎, click abre la tienda (modal creditsShop).
 * El saldo se carga al montar y se refresca cuando se cierra la tienda
 * (activeModal vuelve a null) — así una recarga o gasto se refleja al rato.
 */
export function CreditsNavChip() {
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.spaces.creditBalance()
      .then((res) => { if (!cancelled) setBalance(res.balance); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeModal]); // refresh when the shop modal closes

  return (
    <button
      type="button"
      onClick={() => openModal('creditsShop')}
      className="w-[calc(100%-0px)] group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors motion-reduce:transition-none"
      title="credits"
      aria-label="credits"
    >
      <span aria-hidden="true" className="text-[13px] leading-none">💎</span>
      <span className="min-w-0 flex-1 text-left text-[12px] font-semibold text-txt-secondary group-hover:text-txt-primary tabular-nums">
        {balance ?? '…'}
      </span>
    </button>
  );
}
