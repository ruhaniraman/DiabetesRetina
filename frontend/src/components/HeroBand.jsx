/** The navy-to-blue gradient shared by the signed-in header band and the sign-in panel. */
export const heroGradient = 'bg-gradient-to-br from-[#0b2239] via-[#0f2f52] to-[#165d8a]';

/** A faint, soft glow laid over the gradient (decorative). */
export function HeroGlow() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -bottom-40 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
    </>
  );
}

/**
 * The band at the top of the signed-in pages. Cards float over its lower edge (give the content below a negative top margin).
 */
export default function HeroBand({ children, className = '' }) {
  return (
    <div className={`relative isolate overflow-hidden ${heroGradient} text-white border-b border-[#0a1d31] print:hidden ${className}`}>
      <HeroGlow />
      <div className="relative">{children}</div>
    </div>
  );
}

/** The look shared by every white card on those pages. */
export const cardClass = 'rounded-xl bg-white border border-slate-200 shadow-sm';
