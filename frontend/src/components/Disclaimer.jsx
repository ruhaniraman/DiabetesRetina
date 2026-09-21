import { DISCLAIMER } from '../clinicalText';

export default function Disclaimer({ className = '' }) {
  return <p className={`text-[11px] leading-relaxed text-slate-500 font-medium ${className}`}>{DISCLAIMER}</p>;
}
