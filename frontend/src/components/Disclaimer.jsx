export default function Disclaimer({ className = '' }) {
  return (
    <p className={`text-[11px] leading-relaxed text-slate-500 font-medium ${className}`}>
      <strong className="text-slate-700">Screening aid only.</strong> Results are produced by automated image analysis and are
      not a medical diagnosis, and the tool can miss disease. Always have a qualified eye-care professional review the findings before making any
      treatment decision.
    </p>
  );
}
