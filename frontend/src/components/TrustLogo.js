export function TrustLogo({ size = 'default', className = '', dark = false }) {
  const s = {
    xs:      { box: 22, svg: 12, fontSize: 14, gap: 6 },
    small:   { box: 28, svg: 16, fontSize: 18, gap: 8 },
    default: { box: 32, svg: 18, fontSize: 20, gap: 8 },
    large:   { box: 38, svg: 22, fontSize: 24, gap: 10 },
    xlarge:  { box: 44, svg: 26, fontSize: 28, gap: 10 },
    hero:    { box: 52, svg: 30, fontSize: 34, gap: 12 },
  }[size] || { box: 32, svg: 18, fontSize: 20, gap: 8 };

  const textColor = dark ? '#E6EDF3' : '#0A0E14';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: s.gap }}
      className={className}
      data-testid="trusttrade-logo"
    >
      <div style={{
        width: s.box,
        height: s.box,
        background: '#00D1FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        flexShrink: 0,
      }}>
        <svg width={s.svg} height={s.svg} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="#0A0E14"/>
          <path d="M9 12l2 2 4-4" stroke="#0A0E14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontSize: s.fontSize,
        color: textColor,
        letterSpacing: '-0.5px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        Trust<span style={{ color: '#00D1FF' }}>Trade</span>
      </span>
    </div>
  );
}

export function TrustLogoText({ size = 'default', className = '' }) {
  return <TrustLogo size={size} className={className} dark />;
}

export default TrustLogo;
