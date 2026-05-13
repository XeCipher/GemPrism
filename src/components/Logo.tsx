/**
 * Renders the GemPrism logo as a React component.
 * This SVG code is kept in sync with the /public/icon.svg file
 * to ensure brand consistency across the UI and the browser favicon.
 */
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
        {/* A more accurate glow effect that matches the brand image */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradient for the prism's body, from dark green to a darker tone */}
        <linearGradient id="prismFillGrad" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#032D21" stopOpacity="0.8" />
        </linearGradient>

        {/* The true gradient for the outgoing light rays (green to cyan) */}
        <linearGradient id="lineStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* 1. The incoming white line */}
      <line 
        x1="6" y1="50" x2="22" y2="50"
        stroke="white" strokeWidth="2.5" strokeLinecap="round"
      />

      {/* 2. The prism with a brighter outline and new gradient fill */}
      <polygon 
        points="22,50 73,16 73,84"
        fill="url(#prismFillGrad)"
        stroke="#6ee7b7" strokeWidth="2" strokeLinejoin="round" 
      />

      {/* 3. The outgoing lines, all using the correct gradient stroke */}
      <g filter="url(#glow)">
        <line x1="73" y1="24" x2="94" y2="7"  stroke="url(#lineStrokeGrad)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="73" y1="33" x2="94" y2="21" stroke="url(#lineStrokeGrad)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="73" y1="41" x2="94" y2="37" stroke="url(#lineStrokeGrad)" strokeWidth="2.0" strokeLinecap="round" />
        <line x1="73" y1="50" x2="94" y2="53" stroke="url(#lineStrokeGrad)" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="73" y1="58" x2="94" y2="68" stroke="url(#lineStrokeGrad)" strokeWidth="2.0" strokeLinecap="round" />
        <line x1="73" y1="67" x2="94" y2="82" stroke="url(#lineStrokeGrad)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="73" y1="76" x2="94" y2="96" stroke="url(#lineStrokeGrad)" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}