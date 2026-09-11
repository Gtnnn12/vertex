import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useActivityStore } from '../../../stores/activityStore';
import { api } from '../../../api/client';
import { Toggle } from '../../ui/Toggle';
import { useLanguage } from '../../../contexts/LanguageContext';
import { SettingsCard } from './_shared/SettingsCard';

export function PrivacyPanel() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const showActivity = useActivityStore((s) => s.showActivity);
  const [discoverable, setDiscoverable] = useState(user?.discoverable !== false);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setDiscoverable(user?.discoverable !== false);
  }, [user?.discoverable]);

  const handleToggle = async (enabled: boolean) => {
    setDiscoverable(enabled);
    setSaving(true);
    try {
      const updated = await api.users.update({ discoverable: enabled });
      setUser(updated);
    } catch {
      // Revert on failure
      setDiscoverable(!enabled);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-txt-primary">{t('privacy')}</h2>
      {/* Discovery */}
      <SettingsCard title={t('discovery')} description={t('discovery_description')}>
        <div className="flex items-center justify-between py-1">
          <div className="flex-1 mr-4">
            <div className="text-sm text-txt-primary">{t('allow_others_to_find_my_profile')}</div>
          </div>
          <Toggle enabled={discoverable} onChange={handleToggle} />
        </div>
        {saving && (
          <div className="text-xs text-txt-tertiary">{t('saving')}</div>
        )}
      </SettingsCard>

      {/* Activity Status */}
      <SettingsCard title={t('activity_status')} description={t('share_activity_description')}>
        <div className="flex items-center justify-between py-1">
          <div className="flex-1 mr-4">
            <div className="text-sm text-txt-primary">{t('share_activity_status')}</div>
          </div>
          <Toggle
            enabled={showActivity}
            onChange={async (enabled) => {
              try {
                await api.users.update({ showActivity: enabled });
                useActivityStore.getState().setShowActivity(enabled);
              } catch (err) {
                console.error('Failed to update activity visibility:', err);
              }
            }}
          />
        </div>
      </SettingsCard>
    </div>
  );
}
