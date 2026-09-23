/**
 * The dark, softly glowing band at the top of the signed-in pages. It uses the same navy, amber and blue as the sign-in hero, so the whole app reads as one product.
 * Cards float over its lower edge (give the content below a negative top margin).
 */
export default function HeroBand({ children, className = '' }) {
  return (
    <div className={`relative isolate overflow-hidden bg-gradient-to-br from-[#0d1424] via-[#16223b] to-[#0f172a] text-white print:hidden ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -bottom-28 h-80 w-80 rounded-full bg-amber-500/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** The look shared by every white card on those pages. */
export const cardClass = 'rounded-3xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)]';
