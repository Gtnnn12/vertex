import { ConnectedInstances } from '../ConnectedInstances';
import { useLanguage } from '../../../contexts/LanguageContext';

export function ConnectionsPanel() {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('connections')}</h2>
      <ConnectedInstances />
    </div>
  );
}
