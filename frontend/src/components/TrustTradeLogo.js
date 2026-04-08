import { Link } from 'react-router-dom';

// TrustTrade Logo Component - Use the actual brand logo everywhere
export function TrustTradeLogo({ variant = 'default', size = 'md', linkTo = '/', showText = false, clickable = true }) {
  const sizes = {
    xs: { height: 28 },
    sm: { height: 40 },
    md: { height: 56 },
    lg: { height: 72 },
    xl: { height: 96 },
    xxl: { height: 120 }
  };
  
  const { height } = sizes[size] || sizes.md;
  
  const LogoImage = () => (
    <img 
      src="/trusttrade-logo.png" 
      alt="TrustTrade" 
      style={{ height: `${height}px` }}
      className="object-contain"
    />
  );
  
  if (!clickable) {
    return <LogoImage />;
  }
  
  return (
    <Link to={linkTo} className="flex items-center hover:opacity-90 transition-opacity">
      <LogoImage />
    </Link>
  );
}

// Logo URL for emails (hosted publicly)
export const EMAIL_LOGO_URL = "https://trusttradesa.co.za/trusttrade-logo.png";

// Fallback URL for emails in case the primary doesn't work
export const EMAIL_LOGO_URL_FALLBACK = "https://trusttradesa.co.za/trusttrade-logo.png";

export default TrustTradeLogo;
