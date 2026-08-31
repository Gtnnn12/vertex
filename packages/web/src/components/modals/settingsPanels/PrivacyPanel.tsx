import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useActivityStore } from '../../../stores/activityStore';
import { api } from '../../../api/client';
import { Toggle } from '../../ui/Toggle';
import { useLanguage } from '../../../contexts/LanguageContext';

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
      <h2 className="text-lg font-semibold text-txt-primary mb-6">{t('privacy')}</h2>
      <div>
        <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">
          {t('discovery')}
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3.5">
          <div className="flex items-center justify-between py-1">
            <div className="flex-1 mr-4">
              <div className="text-sm text-txt-primary">{t('allow_others_to_find_my_profile')}</div>
              <div className="text-xs text-txt-tertiary mt-0.5">
                {t('discovery_description')}
              </div>
            </div>
            <Toggle enabled={discoverable} onChange={handleToggle} />
          </div>
          {saving && (
            <div className="text-xs text-txt-tertiary mt-2">{t('saving')}</div>
          )}
        </div>
      </div>

      {/* Activity Status */}
      <div>
        <div className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider mb-1.5">
          {t('activity_status')}
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3.5">
          <div className="flex items-center justify-between py-1">
            <div className="flex-1 mr-4">
              <div className="text-sm text-txt-primary">{t('share_activity_status')}</div>
              <div className="text-xs text-txt-tertiary mt-0.5">
                {t('share_activity_description')}
              </div>
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
        </div>
      </div>
    </div>
  );
}
