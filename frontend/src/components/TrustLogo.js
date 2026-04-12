// TrustTrade Logo Component
// Uses the official TrustTrade logo (cropped to remove whitespace)

export function TrustLogo({ size = 'default', className = '' }) {
  // Size variants - now properly sized since logo is cropped
  const sizes = {
    xs: 'h-8',        // Extra small
    small: 'h-10',    // Small navbar
    default: 'h-12',  // Default navbar - PROMINENT
    large: 'h-14',    // Login page
    xlarge: 'h-16',   // Large display
    hero: 'h-20'      // Hero section
  };

  return (
    <img 
      src="/trusttrade-logo-final.png" 
      alt="TrustTrade"
      className={`${sizes[size]} w-auto object-contain ${className}`}
      style={{ 
        backgroundColor: 'transparent'
      }}
      data-testid="trusttrade-logo"
    />
  );
}

// Text-based fallback logo (if image doesn't load)
export function TrustLogoText({ size = 'default', className = '' }) {
  const textSizes = {
    small: 'text-xl',
    default: 'text-2xl',
    large: 'text-3xl'
  };

  const iconSizes = {
    small: 'w-10 h-10',
    default: 'w-12 h-12',
    large: 'w-14 h-14'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex items-center justify-center ${iconSizes[size]} bg-blue-600 rounded-lg`}>
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
        </svg>
      </div>
      <span className={`font-bold text-slate-900 ${textSizes[size]}`}>
        Trust<span className="text-blue-600">Trade</span>
      </span>
    </div>
  );
}

// Default export - use the image logo
export default TrustLogo;
