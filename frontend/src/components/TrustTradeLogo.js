import { Link } from 'react-router-dom';

// TrustTrade Logo Component - Use everywhere for brand consistency
export function TrustTradeLogo({ variant = 'default', size = 'md', linkTo = '/' }) {
  const sizes = {
    sm: { height: 28, textSize: 'text-lg' },
    md: { height: 36, textSize: 'text-xl' },
    lg: { height: 48, textSize: 'text-2xl' },
    xl: { height: 64, textSize: 'text-3xl' }
  };
  
  const { height, textSize } = sizes[size] || sizes.md;
  
  // For dark backgrounds (navbar, footer)
  if (variant === 'white') {
    return (
      <Link to={linkTo} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
        <img 
          src="/images/trusttrade-logo.png" 
          alt="TrustTrade" 
          style={{ height: `${height}px` }}
          className="object-contain"
        />
      </Link>
    );
  }
  
  // Default - colored logo
  return (
    <Link to={linkTo} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
      <img 
        src="/images/trusttrade-logo.png" 
        alt="TrustTrade" 
        style={{ height: `${height}px` }}
        className="object-contain"
      />
    </Link>
  );
}

// Logo for emails (hosted URL)
export const EMAIL_LOGO_URL = "https://trust-trade-pay.preview.emergentagent.com/images/trusttrade-logo.png";

export default TrustTradeLogo;
