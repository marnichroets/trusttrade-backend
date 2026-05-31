import TrustTradeLogo from './TrustTradeLogo';

const SIZE_MAP = {
  xs: 'small',
  small: 'small',
  default: 'medium',
  large: 'large',
  xlarge: 'large',
  hero: 'large',
};

export function TrustLogo({ size = 'default', className = '', dark = false, showText = true }) {
  return (
    <TrustTradeLogo
      size={SIZE_MAP[size] || 'medium'}
      showText={showText}
      className={className}
      dark={dark}
    />
  );
}

export function TrustLogoText({ size = 'default', className = '' }) {
  return <TrustLogo size={size} className={className} dark showText />;
}

export default TrustLogo;
