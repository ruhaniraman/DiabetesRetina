// Keys are the raw grades returned by the ML backend (`overallRisk`).
export const bannerConfig = {
  No_DR: {
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-white border-emerald-200/90 border-l-emerald-500',
    iconBg: 'bg-emerald-500',
    badge: 'bg-emerald-500',
    iconColor: 'text-emerald-400',
    badgeText: 'Stage 0 Clear',
    title: 'Overall Assessment: Stage 0 – Clear',
  },
  Mild: {
    gradient: 'from-yellow-500/10 via-yellow-500/5 to-white border-yellow-300/90 border-l-yellow-500',
    iconBg: 'bg-yellow-500',
    badge: 'bg-yellow-500',
    iconColor: 'text-yellow-500',
    badgeText: 'Stage 1 Risk',
    title: 'Overall Assessment: Stage 1 – Mild Risk',
  },
  Moderate: {
    gradient: 'from-orange-500/10 via-orange-500/5 to-white border-orange-200/90 border-l-orange-500',
    iconBg: 'bg-orange-500',
    badge: 'bg-orange-500',
    iconColor: 'text-orange-400',
    badgeText: 'Stage 2 Risk',
    title: 'Overall Assessment: Stage 2 – Moderate Risk',
  },
  Severe: {
    gradient: 'from-red-500/10 via-red-500/5 to-white border-red-200/90 border-l-red-500',
    iconBg: 'bg-red-500',
    badge: 'bg-red-500',
    iconColor: 'text-red-400',
    badgeText: 'Stage 3 Risk',
    title: 'Overall Assessment: Stage 3 – Severe Risk',
  },
  Proliferate_DR: {
    gradient: 'from-purple-500/10 via-purple-500/5 to-white border-purple-200/90 border-l-purple-500',
    iconBg: 'bg-purple-500',
    badge: 'bg-purple-500',
    iconColor: 'text-purple-400',
    badgeText: 'Stage 4 Risk',
    title: 'Overall Assessment: Stage 4 – Proliferative Risk',
  },
  Pending: {
    gradient: 'from-slate-500/10 via-slate-500/5 to-white border-slate-200/90 border-l-slate-500',
    iconBg: 'bg-slate-500',
    badge: 'bg-slate-500',
    iconColor: 'text-slate-400',
    badgeText: 'Pending',
    title: 'Overall Assessment: Awaiting Scan Data',
  },
};

// Tag colours for a per-eye grade label such as "Stage 2 - Moderate".
export function getTagColors(label) {
  if (label?.includes('Stage 0')) return 'text-emerald-900 bg-emerald-100/90 border-emerald-200';
  if (label?.includes('Stage 1')) return 'text-yellow-900 bg-yellow-100/90 border-yellow-200';
  if (label?.includes('Stage 2')) return 'text-orange-900 bg-orange-100/90 border-orange-200';
  if (label?.includes('Stage 3')) return 'text-red-900 bg-red-100/90 border-red-200';
  if (label?.includes('Stage 4')) return 'text-purple-900 bg-purple-100/90 border-purple-200';
  return 'text-slate-900 bg-slate-200/90 border-slate-300';
}

// Report-page card themes, keyed like bannerConfig.
export const reportThemes = {
  No_DR: { gradient: 'from-emerald-500/10 to-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-500', text: 'text-emerald-600' },
  Mild: { gradient: 'from-yellow-500/10 to-yellow-50', border: 'border-yellow-300', badge: 'bg-yellow-500', text: 'text-yellow-600' },
  Moderate: { gradient: 'from-orange-500/10 to-orange-50', border: 'border-orange-300', badge: 'bg-orange-500', text: 'text-orange-600' },
  Severe: { gradient: 'from-red-500/10 to-red-50', border: 'border-red-200', badge: 'bg-red-500', text: 'text-red-600' },
  Proliferate_DR: { gradient: 'from-purple-500/10 to-purple-50', border: 'border-purple-300', badge: 'bg-purple-500', text: 'text-purple-600' },
  Pending: { gradient: 'from-slate-50 to-slate-100', border: 'border-slate-200', badge: 'bg-slate-500', text: 'text-slate-700' },
};
