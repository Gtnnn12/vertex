import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useLanguage } from '../../contexts/LanguageContext';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import type { CreditPack, CreditTransaction } from '@backspace/shared';
import { BOOST_CREDIT_COST } from '@backspace/shared/src/evoConstants.js';
import { RechargeChat } from './RechargeChat';

/**
 * Tienda e historial de créditos (monedero VERTEX). Se usa en dos sitios:
 *  - como modal global (activeModal === 'creditsShop') — abierta desde el
 *    CTA «Recargar créditos» del panel de Evoluciones;
 *  - como pestaña «Créditos» en Ajustes de usuario (CreditsPanel).
 *
 * Cosmética: tinte menta del acento, reduced-motion respetado.
 */

const REASON_LABEL_KEYS: Record<string, string> = {
  topup: 'credits_reason_topup',
  refund: 'credits_reason_refund',
  'spend:boost': 'credits_reason_boost',
  'spend:netrex': 'credits_reason_netrex',
};

function reasonLabelKey(reason: string): string {
  // 'topup:pack_5' → 'topup' · 'spend:boost:<spaceId>' → 'spend:boost'
  const base = reason.split(':').slice(0, 2).join(':');
  if (REASON_LABEL_KEYS[base]) return REASON_LABEL_KEYS[base];
  return REASON_LABEL_KEYS[reason.split(':')[0]!] ?? 'credits_reason_other';
}

export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [packs, setPacks] = useState<CreditPack[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [bal, hist, cat] = await Promise.all([
        api.spaces.creditBalance(),
        api.spaces.creditTransactions(),
        api.spaces.creditPacks(),
      ]);
      setBalance(bal.balance);
      setTransactions(hist.transactions);
      setPacks(cat.packs);
    } catch {
      // keep last known state
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, transactions, packs, refresh };
}

export function CreditsShopContent({ onPurchased }: { onPurchased?: () => void }) {
  const { t } = useLanguage();
  const { balance, packs, refresh } = useCredits();
  const username = useAuthStore((s) => s.user?.username ?? '');
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Paso 2 del flujo de recarga in-app: pack elegido + instrucciones paypal.me.
  const [rechargePack, setRechargePack] = useState<CreditPack | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const netrexCost = 6 * BOOST_CREDIT_COST; // 600 créditos = mes de Netrex

  const handleBuy = (pack: CreditPack) => {
    setError('');
    setRechargePack(pack);
  };

  const handlePaid = async () => {
    if (!rechargePack) return;
    setCreatingTicket(true);
    setError('');
    try {
      await api.spaces.rechargeCreate(rechargePack.id);
      // El chat del ticket se muestra desde RechargeFlow vía polling.
      setRechargePack(null);
      setShowChat(true);
    } catch (err: unknown) {
      const code = (err as { body?: { code?: string } })?.body?.code;
      if (code === 'ticket_already_open') {
        setRechargePack(null);
        setShowChat(true);
      } else {
        setError(t('credits_purchase_error'));
      }
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleCancelRecharge = () => {
    setRechargePack(null);
    setError('');
  };

  // Con ticket abierto, el modal muestra el chat directamente.
  useEffect(() => {
    void (async () => {
      try {
        const my = await api.spaces.rechargeMy();
        if (my.ticket?.status === 'open') setShowChat(true);
      } catch {
        /* sin ticket */
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      {/* Saldo */}
      <div className="rounded-lg border border-accent-mint/25 bg-accent-mint/[0.06] p-4 flex items-center gap-3">
        <span aria-hidden="true" className="text-2xl">💎</span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-mint">
            {t('credits_balance_label')}
          </div>
          <div className="text-2xl font-bold text-txt-primary tabular-nums">
            {balance ?? '…'}
          </div>
        </div>
      </div>

      {/* Paso 2: instrucciones de pago + confirmación "Ya he pagado" */}
      {rechargePack && (
        <div className="rounded-xl border border-accent-mint/40 bg-accent-mint/[0.05] p-4">
          <h3 className="text-[13px] font-semibold text-txt-primary">
            {t('recharge_step2_title').replace('{euros}', rechargePack.priceLabel.replace('€', ''))}
          </h3>
          <ol className="mt-2 space-y-1.5 text-[12.5px] text-txt-secondary">
            <li>
              1. {t('recharge_step2_send').replace('{euros}', rechargePack.priceLabel.replace('€', ''))}{' '}
              <span className="font-mono font-bold text-accent-mint">paypal.me/MarioCortes1</span>
            </li>
            <li>
              2. {t('recharge_step2_note')}{' '}
              <span className="font-mono font-bold text-accent-mint">VERTEX-{username}</span>
            </li>
            <li>3. {t('recharge_step2_confirm')}</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="https://paypal.me/MarioCortes1"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-txt-primary transition-colors hover:border-white/30 motion-reduce:transition-none"
            >
              {t('recharge_open_paypal')} ↗
            </a>
            <button
              type="button"
              onClick={() => void handlePaid()}
              disabled={creatingTicket}
              className="rounded-lg bg-accent-mint px-3.5 py-2 text-[12px] font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none"
            >
              {creatingTicket ? t('recharge_creating_ticket') : t('recharge_already_paid')}
            </button>
            <button
              type="button"
              onClick={handleCancelRecharge}
              className="px-2 py-2 text-[12px] text-txt-tertiary transition-colors hover:text-txt-secondary motion-reduce:transition-none"
            >
              {t('recharge_cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Chat del ticket de recarga (después de "Ya he pagado" o con ticket abierto) */}
      {showChat && !rechargePack && (
        <RechargeChat
          onResolved={() => void refresh()}
          onRefreshBalance={onPurchased}
        />
      )}

      {/* Paquetes de recarga — bonus destacado */}
      {!rechargePack && (
      <div>
        <h3 className="text-[13px] font-semibold text-txt-primary mb-2">{t('credits_packs_title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => handleBuy(pack)}
              disabled={buying !== null}
              className={`relative rounded-xl border p-4 text-left transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                pack.bonusPercent > 0
                  ? 'border-accent-mint/50 bg-accent-mint/[0.05] hover:bg-accent-mint/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/25'
              }`}
            >
              {pack.bonusPercent > 0 && (
                <span className="absolute -top-2.5 right-2 rounded-full bg-accent-mint px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black">
                  +{pack.bonusPercent}%
                </span>
              )}
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
                {pack.priceLabel}
              </span>
              <span className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold tracking-tight text-txt-primary tabular-nums">
                  {pack.credits}
                </span>
                <span className="text-[11px] text-txt-tertiary">{t('credits_unit')}</span>
              </span>
              <span className="mt-2 block w-full rounded-md bg-accent-mint py-1.5 text-center text-[12px] font-bold text-black">
                {t('credits_buy')}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-accent-rose">{error}</p>}
        <p className="mt-2 text-[11px] text-txt-tertiary">{t('credits_webhook_note')}</p>
      </div>
      )}

      {/* Netrex con créditos — 600 créditos = 1 mes (6€) */}
      <div className="rounded-xl border border-accent-mint/30 bg-accent-mint/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-txt-primary">{t('credits_netrex_title')}</div>
            <div className="text-[11.5px] text-txt-tertiary">
              {t('credits_netrex_price').replace('{credits}', String(netrexCost))}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setBuying('netrex');
              setError('');
              try {
                const res = await api.spaces.purchaseNetrexWithCredits();
                onPurchased?.();
                void refresh();
                if (res.ok) setError(t('credits_netrex_success'));
              } catch (err: unknown) {
                const code = (err as { body?: { code?: string } })?.body?.code;
                setError(code === 'insufficient_credits'
                  ? t('credits_netrex_insufficient')
                  : t('credits_purchase_error'));
              } finally {
                setBuying(null);
              }
            }}
            disabled={buying !== null}
            className="rounded-md bg-accent-mint px-3 py-2 text-[12px] font-bold text-black hover:opacity-90 disabled:opacity-50 transition-opacity motion-reduce:transition-none"
          >
            {buying === 'netrex' ? t('credits_opening_checkout') : t('credits_netrex_buy')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Historial de movimientos — compartido entre el modal y la pestaña de Ajustes. */
export function CreditHistoryList() {
  const { t } = useLanguage();
  const { transactions } = useCredits();

  if (transactions.length === 0) {
    return <p className="text-[12px] text-txt-tertiary">{t('credits_history_empty')}</p>;
  }

  return (
    <ul className="rounded-lg border border-white/[0.05] overflow-hidden">
      {transactions.map((txn) => {
        const positive = txn.amount > 0;
        return (
          <li key={txn.id} className="flex items-center justify-between border-t border-white/[0.04] px-3 py-2 first:border-t-0">
            <div>
              <div className="text-[13px] text-txt-secondary">{t(reasonLabelKey(txn.reason))}</div>
              <div className="text-[10.5px] text-txt-tertiary tabular-nums">
                {new Date(txn.createdAt).toLocaleString()}
              </div>
            </div>
            <span
              className={`text-[13px] font-bold tabular-nums ${positive ? 'text-accent-mint' : 'text-accent-rose'}`}
              aria-label={positive ? t('credits_amount_positive') : t('credits_amount_negative')}
            >
              {positive ? '+' : ''}{txn.amount}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Pestaña «Créditos» de Ajustes: saldo + tienda + historial. */
export function CreditsPanel() {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('credits_title')}</h2>
      <p className="text-xs text-txt-tertiary -mt-3">{t('credits_subtitle')}</p>
      <CreditsShopContent />
      <div>
        <h3 className="text-[13px] font-semibold text-txt-primary mb-2">{t('credits_history_title')}</h3>
        <CreditHistoryList />
      </div>
    </div>
  );
}

/** Modal global (activeModal === 'creditsShop'). */
export function CreditsShopModal() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const { t } = useLanguage();
  const isOpen = activeModal === 'creditsShop';

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md ${isOpen ? '' : 'hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-label="credits shop"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-[520px] max-h-[85vh] overflow-y-auto scrollbar-thin rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl motion-reduce:transition-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={closeModal}
          className="absolute right-4 top-4 p-1 text-white/40 transition-colors hover:text-white"
          aria-label="close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-txt-primary">{t('credits_title')}</h2>
        <p className="mt-1 text-[12px] text-txt-tertiary">{t('credits_subtitle')}</p>
        <div className="mt-4">
          <CreditsShopContent />
        </div>
        <div className="mt-5">
          <h3 className="text-[13px] font-semibold text-txt-primary mb-2">{t('credits_history_title')}</h3>
          <CreditHistoryList />
        </div>
      </div>
    </div>
  );
}
