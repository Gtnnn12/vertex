import type { ReactNode } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-txt-primary">{children}</h2>;
}

export function SectionSub({ children }: { children: ReactNode }) {
  return <div className="text-xs text-txt-tertiary">{children}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="p-2 bg-accent-rose/10 border border-accent-rose/30 rounded text-txt-danger text-sm">
      {message}
    </div>
  );
}

export function LoadingHint({ label }: { label: string }) {
  return <div className="text-sm text-txt-tertiary py-4">{label}</div>;
}

export function EmptyHint({ label }: { label: string }) {
  return <div className="text-sm text-txt-tertiary py-4 text-center">{label}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
      <div className="text-2xl font-semibold text-txt-primary tabular-nums">{value}</div>
      <div className="text-xs text-txt-secondary mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-txt-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

export function PaginationRow({
  page,
  total,
  pageSize,
  onPage,
  countLabel,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  countLabel: string;
}) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1 text-sm text-txt-secondary hover:text-txt-primary bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {t('admin_previous')}
      </button>
      <span className="text-xs text-txt-tertiary">
        {t('admin_page')} {page} / {totalPages} ({countLabel})
      </span>
      <button
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1 text-sm text-txt-secondary hover:text-txt-primary bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {t('admin_next')}
      </button>
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input-search text-xs py-1 ${className}`}
    >
      {children}
    </select>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-white/[0.02] border border-white/[0.04] p-3.5 ${className}`}>{children}</div>;
}

export function formatDate(ts: number | null | undefined, lang: 'es' | 'en'): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(ts: number | null | undefined, lang: 'es' | 'en'): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(lang, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(ts: number | null | undefined, lang: 'es' | 'en'): string {
  if (!ts) return '—';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 60000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3600000) return rtf.format(Math.round(diff / 60000), 'minute');
  if (abs < 86400000) return rtf.format(Math.round(diff / 3600000), 'hour');
  if (abs < 604800000) return rtf.format(Math.round(diff / 86400000), 'day');
  if (abs < 2592000000) return rtf.format(Math.round(diff / 604800000), 'week');
  return formatDate(ts, lang);
}

export function formatSecondsDuration(seconds: number | null | undefined, lang: 'es' | 'en'): string {
  if (!seconds) return '—';
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const minutes = seconds / 60;
  if (minutes < 60) return rtf.format(Math.round(minutes), 'minute');
  const hours = minutes / 60;
  if (hours < 48) return rtf.format(Math.round(hours), 'hour');
  const days = hours / 24;
  return rtf.format(Math.round(days), 'day');
}