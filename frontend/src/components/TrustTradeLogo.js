import { Link } from 'react-router-dom';

export const TRUSTTRADE_LOGO_SRC = '/assets/trusttrade-logo.png';
export const TRUSTTRADE_LOGO_MARK_SRC = '/assets/trusttrade-logo-mark.png';

const SIZES = {
  small: {
    wordmark: { width: 118, height: 44 },
    mark: { width: 32, height: 32 },
  },
  medium: {
    wordmark: { width: 154, height: 58 },
    mark: { width: 44, height: 44 },
  },
  large: {
    wordmark: { width: 202, height: 76 },
    mark: { width: 58, height: 58 },
  },
};

const LEGACY_SIZE_MAP = {
  xs: 'small',
  sm: 'small',
  md: 'medium',
  default: 'medium',
  lg: 'large',
  xl: 'large',
  xlarge: 'large',
  hero: 'large',
};

export function TrustTradeLogo({
  size = 'medium',
  showText = true,
  className = '',
  linkTo,
  clickable = false,
  dark = false,
}) {
  const normalizedSize = SIZES[size] ? size : LEGACY_SIZE_MAP[size] || 'medium';
  const dimensions = showText ? SIZES[normalizedSize].wordmark : SIZES[normalizedSize].mark;
  const src = showText ? TRUSTTRADE_LOGO_SRC : TRUSTTRADE_LOGO_MARK_SRC;

  const logo = (
    <span
      className={className}
      data-testid="trusttrade-logo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      <img
        src={src}
        alt="TrustTrade"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          maxWidth: '100%',
          objectFit: 'contain',
          display: 'block',
          // On dark surfaces (sidebar, landing nav/footer) render the wordmark
          // solid white so the dark "Trade" half isn't lost against the background.
          ...(dark ? { filter: 'brightness(0) invert(1)' } : {}),
        }}
      />
    </span>
  );

  if (clickable || linkTo) {
    return (
      <Link to={linkTo || '/'} className="inline-flex items-center hover:opacity-90 transition-opacity">
        {logo}
      </Link>
    );
  };

  return logo;
}

// Logo URL for emails (hosted publicly)
export const EMAIL_LOGO_URL = "https://trusttrade-backend-production-3efa.up.railway.app/static/trusttrade-logo.png";

// Fallback URL for emails in case the primary doesn't work
export const EMAIL_LOGO_URL_FALLBACK = EMAIL_LOGO_URL;

export default TrustTradeLogo;
