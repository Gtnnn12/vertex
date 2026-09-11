import { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettingsSections } from '../../hooks/useSettingsSections';
import { SettingsTabBar } from '../modals/SettingsTabBar';
import { GeneralPanel } from '../modals/instanceSettingsPanels/GeneralPanel';
import { RegistrationPanel } from '../modals/instanceSettingsPanels/RegistrationPanel';
import { FederationPanel } from '../modals/instanceSettingsPanels/FederationPanel';
import { StreamingPanel } from '../modals/instanceSettingsPanels/StreamingPanel';
import { StoragePanel } from '../modals/instanceSettingsPanels/StoragePanel';

type SubTab = 'general' | 'registration' | 'federation' | 'streaming' | 'storage';

export function AdminSettings() {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState<SubTab>('general');
  const [approvalCount, setApprovalCount] = useState(0);

  const sections = useMemo(
    () => [
      { id: 'general', label: t('general') },
      { id: 'registration', label: t('registration') },
      { id: 'federation', label: t('federation'), badgeCount: approvalCount },
      { id: 'streaming', label: t('streaming') },
      { id: 'storage', label: t('storage') },
    ],
    [approvalCount, t]
  );

  const handleNavigate = useCallback((id: string) => {
    setSubTab(id as SubTab);
  }, []);

  useSettingsSections(sections, { onNavigate: handleNavigate, activeTab: subTab });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t('admin_settings')}</h2>
        <div className="text-xs text-txt-tertiary mt-0.5">{t('admin_settings_sub')}</div>
      </div>
      <SettingsTabBar />
      {subTab === 'general' && <GeneralPanel />}
      {subTab === 'registration' && <RegistrationPanel />}
      {subTab === 'federation' && <FederationPanel onApprovalCountChange={setApprovalCount} />}
      {subTab === 'streaming' && <StreamingPanel />}
      {subTab === 'storage' && <StoragePanel />}
    </div>
  );
}