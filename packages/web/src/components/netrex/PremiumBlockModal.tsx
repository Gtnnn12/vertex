import { useLanguage } from '../../contexts/LanguageContext';
import { useUIStore } from '../../stores/uiStore';
import { Modal } from '../ui/Modal';

export function PremiumBlockModal() {
  const { t } = useLanguage();
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const modalData = useUIStore((s) => s.modalData);

  const isOpen = activeModal === 'premiumBlock';
  const title = (modalData?.title as string) || t('premium_block_default_title');
  const message = (modalData?.message as string) || t('premium_block_default_message');
  const price = (modalData?.price as string) || '4,99 €/mes';

  const handleClose = () => {
    closeModal();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-sm"
    >
      <div className="text-center py-4">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-accent-peach/25 bg-accent-peach/10 mb-6">
          <span className="text-[28px]" style={{ textShadow: '0 0 24px rgba(252,165,165,0.5)' }}>✦</span>
        </div>

        {/* Title */}
        <h3 className="text-[20px] font-bold text-txt-primary tracking-tight mb-2">
          {title}
        </h3>

        {/* Message */}
        <p className="text-[13px] text-txt-secondary leading-relaxed mb-6">
          {message}
        </p>

        {/* Price */}
        <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-peach/10 border border-accent-peach/20 mb-6">
          <span className="text-[16px] font-bold text-accent-peach">{price}</span>
          <span className="text-[11px] text-accent-peach/70">{t('per_month')}</span>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <button
            className="w-full py-3 rounded-xl bg-accent-peach/15 border border-accent-peach/30 text-[13px] font-semibold text-accent-peach hover:bg-accent-peach/25 hover:border-accent-peach/40 transition-all duration-200"
            onClick={() => {
              // TODO: Link to subscription page when implemented
              handleClose();
            }}
          >
            {t('get_netrex')}
          </button>
          <p className="text-[10px] text-txt-tertiary">{t('coming_soon')}</p>
        </div>
      </div>
    </Modal>
  );
}
