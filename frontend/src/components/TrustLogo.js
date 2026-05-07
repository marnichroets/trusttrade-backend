export function TrustLogo({ size = 'default', className = '', dark = false }) {
  const s = {
    xs:      { box: 22, fontSize: 14, gap: 6 },
    small:   { box: 28, fontSize: 18, gap: 8 },
    default: { box: 32, fontSize: 20, gap: 8 },
    large:   { box: 38, fontSize: 24, gap: 10 },
    xlarge:  { box: 44, fontSize: 28, gap: 10 },
    hero:    { box: 52, fontSize: 34, gap: 12 },
  }[size] || { box: 32, fontSize: 20, gap: 8 };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: s.gap }}
      className={className}
      data-testid="trusttrade-logo"
    >
      <svg width={s.box} height={s.box} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        {/* Shield — darker left half (shadow) */}
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35V2z" fill="#1351a5"/>
        {/* Shield — brighter right half */}
        <path d="M12 2v18.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="#1a73e8"/>
        {/* Padlock body */}
        <rect x="9.8" y="9.8" width="4.4" height="3.6" rx="0.8" fill="white"/>
        {/* Padlock shackle */}
        <path d="M10.8 9.8V8.2a1.2 1.2 0 012.4 0v1.6" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
        {/* Checkmark */}
        <path d="M7 14l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontSize: s.fontSize,
        letterSpacing: '-0.5px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ color: '#1a73e8' }}>Trust</span><span style={{ color: '#E6EDF3' }}>Trade</span>
      </span>
    </div>
  );
}

export function TrustLogoText({ size = 'default', className = '' }) {
  return <TrustLogo size={size} className={className} dark />;
}

export default TrustLogo;
