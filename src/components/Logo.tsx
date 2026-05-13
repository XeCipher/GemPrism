export function LogoLayeredCore({ size = 24, className = "" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      className={className} 
      viewBox="0 0 100 100" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="prismGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* The dark background <rect> element has been removed */}

      <line 
        x1="6" y1="50" x2="22" y2="50"
        stroke="white" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" 
      />

      <polygon 
        points="22,50 73,16 73,84"
        fill="url(#prismGrad)"
        stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" 
      />

      <line x1="73" y1="24" x2="94" y2="7" stroke="#a7f3d0" strokeWidth="1.6" strokeLinecap="round" opacity="0.42" />
      <line x1="73" y1="33" x2="94" y2="21" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" opacity="0.62" />
      <line x1="73" y1="41" x2="94" y2="37" stroke="#34d399" strokeWidth="2.0" strokeLinecap="round" opacity="0.82" />
      <line x1="73" y1="50" x2="94" y2="53" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" opacity="1" filter="url(#glow)" />
      <line x1="73" y1="58" x2="94" y2="68" stroke="#06b6d4" strokeWidth="2.0" strokeLinecap="round" opacity="0.80" />
      <line x1="73" y1="67" x2="94" y2="82" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round" opacity="0.58" />
      <line x1="73" y1="76" x2="94" y2="96" stroke="#0369a1" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}