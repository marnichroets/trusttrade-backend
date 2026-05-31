// The PNG at /logo-tt.png already contains BOTH the shield and the
// "TrustTrade" wordmark, so this component renders just the image — no SVG, no
// separate text span (which would duplicate the wordmark baked into the PNG).

const HEIGHTS = {
  xs:      24,
  small:   28,
  default: 36,
  large:   48,
  xlarge:  56,
  hero:    64,
};

export function TrustLogo({ size = 'default', className = '', dark = false }) {
  const height = HEIGHTS[size] || 36;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      className={className}
      data-testid="trusttrade-logo"
    >
      <img
        src="/logo-tt.png"
        alt="TrustTrade"
        style={{
          height,
          width: 'auto',
          // On dark backgrounds (navbar/sidebar) lift the logo slightly.
          ...(dark ? { filter: 'brightness(1.1)' } : {}),
        }}
      />
    </div>
  );
}

export function TrustLogoText({ size = 'default', className = '' }) {
  return <TrustLogo size={size} className={className} dark />;
}

export default TrustLogo;
