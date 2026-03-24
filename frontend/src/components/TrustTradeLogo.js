import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

// TrustTrade Logo Component - Use everywhere for brand consistency
export function TrustTradeLogo({ variant = 'default', size = 'md', linkTo = '/', showText = true, clickable = true }) {
  const sizes = {
    sm: { height: 24, textSize: 'text-lg' },
    md: { height: 32, textSize: 'text-xl' },
    lg: { height: 48, textSize: 'text-2xl' },
    xl: { height: 64, textSize: 'text-3xl' }
  };
  
  const { height, textSize } = sizes[size] || sizes.md;
  
  const LogoContent = () => (
    <div className="flex items-center gap-2">
      <div 
        className="flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
        style={{ width: `${height}px`, height: `${height}px` }}
      >
        <Shield className="w-5 h-5" style={{ width: `${height * 0.6}px`, height: `${height * 0.6}px` }} />
      </div>
      {showText && (
        <span className={`font-bold ${textSize} ${variant === 'white' ? 'text-white' : 'text-slate-900'}`}>
          TrustTrade
        </span>
      )}
    </div>
  );
  
  // For dark backgrounds (navbar, footer)
  if (variant === 'white') {
    if (!clickable) {
      return <LogoContent />;
    }
    return (
      <Link to={linkTo} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
        <LogoContent />
      </Link>
    );
  }
  
  // Default - colored logo
  if (!clickable) {
    return <LogoContent />;
  }
  
  return (
    <Link to={linkTo} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
      <LogoContent />
    </Link>
  );
}

// Logo for emails (hosted URL)
export const EMAIL_LOGO_URL = "https://trust-trade-pay.preview.emergentagent.com/images/trusttrade-logo.png";

export default TrustTradeLogo;
