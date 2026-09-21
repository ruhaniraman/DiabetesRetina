
export default function Logo({ className = "w-12 h-12 md:w-16 md:h-16" }) {
  return (
    <svg 
      viewBox="0 0 100 60" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={`shrink-0 ${className}`}
    >
      {/* Outer Almond Eye Outline & White Sclera */}
      <path 
        d="M 6 30 C 26 5, 74 5, 94 30 C 74 55, 26 55, 6 30 Z" 
        fill="#FFFFFF" 
        stroke="#0F172A" 
        strokeWidth="5"
      />
      {/* Central Iris Circle */}
      <circle cx="50" cy="30" r="23.5" fill="#0F172A" />
      {/* 4-Point Sparkle Star in Amber */}
      <path 
        d="M 50 14 Q 50 30, 66 30 Q 50 30, 50 46 Q 50 30, 34 30 Q 50 30, 50 14 Z" 
        fill="#D97706" 
      />
    </svg>
  );
}
