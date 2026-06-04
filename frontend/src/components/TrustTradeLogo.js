import { Link } from 'react-router-dom';

export const TRUSTTRADE_LOGO_SRC = '/assets/trusttrade-logo.png';
export const TRUSTTRADE_LOGO_MARK_SRC = '/assets/trusttrade-logo-mark.png';
// Dark-surface variants: the dark "Trade" wordmark + dark shield icons are
// recoloured white, while the blue shield is kept. Used on the dark sidebar/landing.
export const TRUSTTRADE_LOGO_DARK_SRC = '/assets/trusttrade-logo-dark.png';
export const TRUSTTRADE_LOGO_MARK_DARK_SRC = '/assets/trusttrade-logo-mark-dark.png';

const SHIELD_BLUE = '#2F81F4';

// The shield mark is rendered as an inline SVG (not a PNG) so the checkmark and lock
// are guaranteed white (#FFFFFF) on EVERY background — the baked PNGs had dark icons
// on some surfaces. Blue shield, white check, white padlock.
function ShieldMark({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Shield */}
      <path
        d="M20 2.5 L35 8 V20.5 C35 30 28.6 37 20 40.5 C11.4 37 5 30 5 20.5 V8 Z"
        fill={SHIELD_BLUE}
      />
      {/* White checkmark (upper) */}
      <path
        d="M13.2 19.2 L18 24 L27.2 13.4"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Small white padlock (lower) */}
      <path
        d="M17.4 29.2 V27.4 a2.6 2.6 0 0 1 5.2 0 V29.2"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        fill="none"
      />
      <rect x="15.8" y="29" width="8.4" height="6.4" rx="1.4" fill="#FFFFFF" />
    </svg>
  );
}

// Brand colours for the wordmark text. "Trust" is always blue; "Trade" is white on
// dark surfaces (sidebar / landing / emails — where black text was invisible) and
// dark navy on light surfaces (login / admin / share) so it's always legible.
const TRUST_BLUE = '#2F81F4';
const TRADE_WHITE = '#FFFFFF';
const TRADE_NAVY = '#0F1E35';

// Clean, neutral sans for the wordmark — renders consistently everywhere (and before
// any web font loads), matching the original logo's weight/proportions.
const WORDMARK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Sizes tuned to match the ORIGINAL logo footprint: a compact shield mark + bold (700)
// wordmark, sized so the lockup fits the navbar/sidebar/landing without looking oversized.
const SIZES = {
  small: {
    mark: { width: 24, height: 24 },
    font: 15.5, gap: 7,
  },
  medium: {
    mark: { width: 29, height: 29 },
    font: 19, gap: 7,
  },
  large: {
    mark: { width: 38, height: 38 },
    font: 24, gap: 8,
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
  tradeColor,
}) {
  const normalizedSize = SIZES[size] ? size : LEGACY_SIZE_MAP[size] || 'medium';
  const dim = SIZES[normalizedSize];
  const tradeC = tradeColor || (dark ? TRADE_WHITE : TRADE_NAVY);

  const logo = (
    <span
      className={className}
      data-testid="trusttrade-logo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: showText ? dim.gap : 0,
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      {/* Inline SVG shield — white check + lock guaranteed on any background */}
      <ShieldMark size={dim.mark.width} />
      {showText && (
        <span
          style={{
            fontFamily: WORDMARK_FONT,
            fontWeight: 700,
            fontSize: dim.font,
            letterSpacing: '-0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: TRUST_BLUE }}>Trust</span>
          <span style={{ color: tradeC }}>Trade</span>
        </span>
      )}
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
