// TrustTrade Logo Component
// Use the uploaded logo with proper sizing (logo is 1200x1200 with whitespace)

export function TrustLogo({ size = 'default', className = '' }) {
  // The logo has significant whitespace, so we need larger heights
  const sizes = {
    small: 'h-10',    // Navbar - dashboard
    default: 'h-12',  // Navbar - landing
    large: 'h-14',    // Login page
    xlarge: 'h-20'    // Large display
  };

  return (
    <img 
      src="/trusttrade-logo-new.png" 
      alt="TrustTrade"
      className={`${sizes[size]} w-auto object-contain ${className}`}
      style={{ 
        backgroundColor: 'transparent'
      }}
    />
  );
}

// Icon-only version for favicon/compact spaces
export function TrustLogoIcon({ size = 'default', className = '' }) {
  const sizes = {
    small: 'h-8 w-8',
    default: 'h-10 w-10',
    large: 'h-12 w-12'
  };

  return (
    <img 
      src="/trusttrade-logo-new.png" 
      alt="TrustTrade"
      className={`${sizes[size]} object-contain object-left ${className}`}
      style={{ 
        backgroundColor: 'transparent',
        clipPath: 'inset(0 65% 0 0)' // Show only the icon portion
      }}
    />
  );
}

export default TrustLogo;
