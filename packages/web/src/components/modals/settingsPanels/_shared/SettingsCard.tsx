import type { ReactNode } from 'react';

/**
 * Layered settings card — the shared premium card language of the user
 * settings modal (small uppercase title + discrete description + body inside
 * a thin-bordered layered surface with a subtle hover lift).
 *
 * Lives under `_shared/` because only settings panels use this look.
 */
export function SettingsCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-colors duration-200 hover:border-white/[0.09] motion-reduce:transition-none">
      <header className="px-4 pt-3.5 pb-1">
        <h3 className="text-[10.5px] font-semibold text-txt-tertiary uppercase tracking-[0.1em]">{title}</h3>
        {description && <p className="text-[11px] text-txt-tertiary/60 mt-0.5">{description}</p>}
      </header>
      <div className="px-4 pb-4 pt-2 space-y-4">{children}</div>
    </section>
  );
}
