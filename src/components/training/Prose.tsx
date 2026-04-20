import { type ReactNode } from 'react';

/**
 * Small set of styled primitives so every section looks cohesive without
 * repeating long class strings. All components here are layout-only.
 */

export function Section({
  id,
  eyebrow,
  title,
  children,
  accent = 'piano',
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  accent?: 'piano' | 'guitar';
}) {
  const accentClass = accent === 'piano' ? 'text-piano' : 'text-guitar';
  return (
    <section id={id} className="scroll-mt-24 py-14 md:py-20 border-b border-white/5">
      <div className="max-w-3xl">
        {eyebrow && (
          <div
            className={`text-[10px] font-mono uppercase tracking-[0.35em] mb-4 ${accentClass}`}
          >
            {eyebrow}
          </div>
        )}
        <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-tight mb-8 text-text">
          {title}
        </h2>
        <div className="flex flex-col gap-5 text-[15px] md:text-base leading-relaxed text-[#c9c9e6]">
          {children}
        </div>
      </div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display font-bold text-xl md:text-2xl text-text mt-8 mb-1">
      {children}
    </h3>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="text-text font-semibold">{children}</strong>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[13px] bg-white/5 text-text px-1.5 py-0.5 rounded border border-white/5">
      {children}
    </code>
  );
}

export function CodeBlock({ language = 'python', code }: { language?: string; code: string }) {
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-white/5 bg-[#0a0a14]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted">
          {language}
        </span>
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-[#d8d8f0]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Callout({
  variant = 'info',
  title,
  children,
}: {
  variant?: 'info' | 'piano' | 'guitar';
  title?: string;
  children: ReactNode;
}) {
  const palette = {
    info: 'border-white/10 bg-white/[0.03] text-[#c9c9e6]',
    piano: 'border-piano/30 bg-piano/[0.04] text-[#c9c9e6]',
    guitar: 'border-guitar/30 bg-guitar/[0.05] text-[#c9c9e6]',
  }[variant];
  return (
    <aside
      className={`my-4 rounded-xl border px-5 py-4 text-[14px] leading-relaxed ${palette}`}
    >
      {title && (
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] mb-1 text-muted">
          {title}
        </div>
      )}
      <div>{children}</div>
    </aside>
  );
}

export function StatRow({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
        >
          <div className="font-display font-extrabold text-xl md:text-2xl text-text tabular-nums">
            {s.value}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted mt-0.5">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2 list-disc pl-5 marker:text-muted">{children}</ul>;
}

export function OrderedList({ children }: { children: ReactNode }) {
  return (
    <ol className="flex flex-col gap-2 list-decimal pl-5 marker:text-muted marker:font-mono">
      {children}
    </ol>
  );
}
