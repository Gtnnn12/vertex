import { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { isElectron, getElectronAPI } from '../../../platform/platform';

/** Shape of a Gumroad offer code as returned by the main process. */
interface AdminOfferCode {
  id: string;
  name: string;
  code: string;
  type: 'percent' | 'fixed';
  amount: number;
  universal: boolean;
  timesUsed: number;
  maxUses: number | null;
  startsAt: string | null;
  expiresAt: string | null;
}

/**
 * Owner-only discount-code panel (hidden "Admin" settings tab). Talks to the
 * Gumroad offer-codes API through the Electron main process; every call is
 * re-authenticated with the admin access key, and both secrets live encrypted
 * (safeStorage) on this machine only.
 */

type Phase = 'loading' | 'set-key' | 'locked' | 'setup-token' | 'ready';

const CODE_REGEX = /^[A-Za-z0-9_-]+$/;
const FIELD =
  'w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-tertiary/50 focus:outline-none focus:border-netrex/60 focus:ring-1 focus:ring-netrex/30';

interface ListResult {
  ok: boolean;
  codes?: AdminOfferCode[];
  error?: string;
}

export function AdminDiscountsPanel() {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>('loading');
  const [adminKey, setAdminKey] = useState('');
  const [products, setProducts] = useState<{ plan: string; productId: string }[]>([]);
  const [productIdx, setProductIdx] = useState(0);
  const [codes, setCodes] = useState<AdminOfferCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron() || !getElectronAPI()?.adminCodesSetupState) {
      setPhase('locked');
      return;
    }
    void getElectronAPI()!.adminCodesSetupState().then((s) => {
      if (!s.hasAdminKey) setPhase('set-key');
      else if (!s.hasToken) setPhase('setup-token');
      else setPhase('locked');
    });
    void getElectronAPI()!.adminCodesProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const loadCodes = useCallback(async (productId: string) => {
    setCodes(null);
    setBusy(true);
    try {
      const res = (await getElectronAPI()!.adminCodesList(adminKey, productId)) as ListResult;
      if (res.ok) setCodes(res.codes ?? []);
      else setNotice({ kind: 'err', text: `${t('admin_codes_error_prefix')} ${res.error}` });
    } finally {
      setBusy(false);
    }
  }, [adminKey, t]);

  useEffect(() => {
    if (phase !== 'ready' || products.length === 0) return;
    void loadCodes(products[Math.min(productIdx, products.length - 1)].productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, productIdx]);

  const errText = (error?: string) =>
    error === 'unauthorized'
      ? t('admin_access_wrong')
      : error === 'token_missing'
        ? t('admin_token_missing')
        : error === 'code_invalid'
          ? t('admin_codes_code_invalid')
          : `${t('admin_codes_error_prefix')} ${error ?? 'unknown'}`;

  // ── Phase: define admin key (first run) ──
  if (phase === 'set-key') {
    return (
      <div className="max-w-[480px] mx-auto">
        <h2 className="text-lg font-semibold text-txt-primary">{t('admin_discounts_title')}</h2>
        <label className="mt-6 block text-[11px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
          {t('admin_access_key_label')}
        </label>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder={t('admin_access_key_placeholder')}
          className={`${FIELD} mt-2 font-mono`}
        />
        <p className="mt-2 text-[12px] text-txt-tertiary">{t('admin_access_key_hint')}</p>
        <button
          type="button"
          disabled={busy || adminKey.trim().length < 8}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await getElectronAPI()!.adminCodesSetAccessKey(adminKey);
              if (res.ok) setPhase('setup-token');
              else setNotice({ kind: 'err', text: t('admin_access_wrong') });
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-lg bg-netrex px-4 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-netrex/90 disabled:opacity-50"
        >
          {t('admin_access_unlock')}
        </button>
        <Notice notice={notice} />
      </div>
    );
  }

  // ── Phase: paste Gumroad token (once) ──
  if (phase === 'setup-token') {
    return (
      <div className="max-w-[480px] mx-auto">
        <h2 className="text-lg font-semibold text-txt-primary">{t('admin_discounts_title')}</h2>
        <label className="mt-6 block text-[11px] font-bold uppercase tracking-[0.16em] text-txt-tertiary">
          {t('admin_token_label')}
        </label>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder={t('admin_token_placeholder')}
          className={`${FIELD} mt-2 font-mono`}
        />
        <p className="mt-2 text-[12px] text-txt-tertiary">{t('admin_token_hint')}</p>
        <button
          type="button"
          disabled={busy || adminKey.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            try {
              // adminKey here holds the token being pasted; re-ask the admin
              // key on first use of the panel below.
              const res = await getElectronAPI()!.adminCodesSetToken(adminKey, adminKey);
              if (res.ok) {
                setAdminKey('');
                setPhase('locked');
                setNotice({ kind: 'ok', text: t('admin_token_saved') });
              } else {
                setNotice({ kind: 'err', text: errText(res.error) });
              }
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-lg bg-netrex px-4 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-netrex/90 disabled:opacity-50"
        >
          {t('admin_token_save')}
        </button>
        <Notice notice={notice} />
      </div>
    );
  }

  // ── Phase: locked (normal entry) ──
  if (phase !== 'ready') {
    return (
      <div className="max-w-[480px] mx-auto">
        <h2 className="text-lg font-semibold text-txt-primary">{t('admin_discounts_title')}</h2>
        <p className="mt-1 text-[13px] text-txt-tertiary">{t('admin_access_locked')}</p>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && adminKey) {
              void getElectronAPI()!.adminCodesUnlock(adminKey).then((r) => {
                if (r.ok) {
                  setPhase('ready');
                  setNotice(null);
                } else setNotice({ kind: 'err', text: t('admin_access_wrong') });
              });
            }
          }}
          placeholder={t('admin_access_key_placeholder')}
          className={`${FIELD} mt-4 font-mono`}
        />
        <button
          type="button"
          disabled={!adminKey}
          onClick={() =>
            void getElectronAPI()!.adminCodesUnlock(adminKey).then((r) => {
              if (r.ok) {
                setPhase('ready');
                setNotice(null);
              } else setNotice({ kind: 'err', text: t('admin_access_wrong') });
            })
          }
          className="mt-3 rounded-lg bg-netrex px-4 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-netrex/90 disabled:opacity-50"
        >
          {t('admin_access_unlock')}
        </button>
        <Notice notice={notice} />
      </div>
    );
  }

  // ── Phase: ready — offer codes ──
  const current = products[productIdx];
  return (
    <div className="max-w-[760px] mx-auto">
      <h2 className="text-lg font-semibold text-txt-primary">{t('admin_discounts_title')}</h2>
      <p className="mt-1 text-[13px] text-txt-tertiary">{t('admin_discounts_subtitle')}</p>

      {/* Product switcher */}
      {products.length > 0 && (
        <div className="mt-5 flex gap-2">
          {products.map((p, i) => (
            <button
              key={p.productId}
              type="button"
              onClick={() => setProductIdx(i)}
              className={`rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                i === productIdx
                  ? 'border-netrex bg-netrex/10 text-netrex'
                  : 'border-white/10 text-txt-tertiary hover:border-white/25 hover:text-txt-secondary'
              }`}
            >
              {p.plan === 'monthly' ? t('admin_codes_product_monthly') : t('admin_codes_product_lifetime')}
            </button>
          ))}
        </div>
      )}

      {/* Codes table */}
      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        {busy && codes === null && (
          <p className="py-6 text-center text-[12.5px] text-txt-tertiary">{t('admin_codes_loading')}</p>
        )}
        {codes !== null && codes.length === 0 && (
          <p className="py-6 text-center text-[12.5px] text-txt-tertiary">{t('admin_codes_empty')}</p>
        )}
        {codes !== null && codes.length > 0 && (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-txt-tertiary">
                <th className="py-2 pr-3">{t('admin_codes_code')}</th>
                <th className="py-2 pr-3">{t('admin_codes_discount')}</th>
                <th className="py-2 pr-3">{t('admin_codes_uses')}</th>
                <th className="py-2 pr-3">{t('admin_codes_dates')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.05]">
                  <td className="py-2 pr-3 font-mono text-txt-primary">
                    {c.code}
                    <span className="ml-2 text-[11px] text-txt-tertiary">{c.name}</span>
                  </td>
                  <td className="py-2 pr-3 text-netrex font-semibold">
                    {c.type === 'percent' ? `${c.amount}%` : `€${(c.amount / 100).toFixed(2)}`}
                  </td>
                  <td className="py-2 pr-3 text-txt-secondary tabular-nums">
                    {c.timesUsed}{c.maxUses !== null ? `/${c.maxUses}` : ''}
                  </td>
                  <td className="py-2 pr-3 text-[11.5px] text-txt-tertiary">
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {confirmDelete === c.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-[11px] text-red-400">
                          {t('admin_codes_delete_confirm').replace('{code}', c.code)}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const res = (await getElectronAPI()!.adminCodesDelete(adminKey, current.productId, c.id)) as { ok: boolean; error?: string };
                              if (res.ok) {
                                setNotice({ kind: 'ok', text: t('admin_codes_deleted') });
                                setConfirmDelete(null);
                                void loadCodes(current.productId);
                              } else setNotice({ kind: 'err', text: errText(res.error) });
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/10"
                        >
                          {t('admin_codes_delete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-[11px] text-txt-tertiary hover:text-txt-secondary"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-2">
                        {/* Edit = duplicate + delete (Gumroad's API cannot
                            change the % via PUT). Prefills the create form. */}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setName(`${c.name} copy`);
                            setCode(c.code);
                            setType(c.type);
                            setValue(c.type === 'percent' ? String(c.amount) : (c.amount / 100).toFixed(2));
                            setMaxUses(c.maxUses !== null ? String(c.maxUses) : '');
                            setExpiresAt(c.expiresAt ? c.expiresAt.slice(0, 10) : '');
                            setConfirmDelete(c.id); // keep delete one click away
                            document.querySelector('#admin-create-form')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-txt-tertiary transition-colors hover:border-white/25 hover:text-txt-secondary disabled:opacity-50"
                        >
                          {t('admin_codes_dupe_delete')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDelete(c.id)}
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-txt-tertiary transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                        >
                          {t('admin_codes_delete')}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form */}
      <div id="admin-create-form" className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin_codes_name')} className={FIELD} />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('admin_codes_code')} className={`${FIELD} font-mono uppercase`} />
          <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')} className={FIELD}>
            <option value="percent">{t('admin_codes_duration_percent')}</option>
            <option value="fixed">{t('admin_codes_duration_fixed')}</option>
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('admin_codes_value_placeholder')} className={FIELD} />
          <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t('admin_codes_max_uses')} className={FIELD} />
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder={t('admin_codes_expires_at')} className={FIELD} />
        </div>
        <button
          type="button"
          disabled={busy || !name.trim() || !code.trim() || !value}
          onClick={async () => {
            if (!CODE_REGEX.test(code.trim())) {
              setNotice({ kind: 'err', text: t('admin_codes_code_invalid') });
              return;
            }
            setBusy(true);
            try {
              const res = (await getElectronAPI()!.adminCodesCreate(adminKey, {
                productId: current.productId,
                name: name.trim(),
                code: code.trim(),
                type,
                value: Number(value),
                maxUses: maxUses ? Number(maxUses) : null,
                expiresAt: expiresAt || null,
              })) as { ok: boolean; error?: string };
              if (res.ok) {
                setNotice({ kind: 'ok', text: t('admin_codes_created') });
                setName(''); setCode(''); setValue(''); setMaxUses(''); setExpiresAt('');
                void loadCodes(current.productId);
              } else setNotice({ kind: 'err', text: errText(res.error) });
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 rounded-lg bg-netrex px-4 py-2 text-[12.5px] font-bold text-black transition-colors hover:bg-netrex/90 disabled:opacity-50"
        >
          {busy ? t('admin_codes_creating') : t('admin_codes_create')}
        </button>
        <Notice notice={notice} />
      </div>
    </div>
  );
}

function Notice({ notice }: { notice: { kind: 'ok' | 'err'; text: string } | null }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${
        notice.kind === 'ok'
          ? 'border-netrex/30 bg-netrex/[0.06] text-netrex'
          : 'border-red-500/30 bg-red-500/[0.06] text-red-400'
      }`}
    >
      {notice.text}
    </p>
  );
}
