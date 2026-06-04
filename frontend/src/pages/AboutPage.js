import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Lock, Truck, Scale, ShieldCheck, BadgeCheck, MapPin,
  Handshake, Wallet, CheckCircle2, Building2, Package,
} from 'lucide-react';
import TrustTradeLogo from '../components/TrustTradeLogo';

// Dark theme palette (matches the app)
const C = {
  bg: '#0D1117',
  card: '#161B22',
  cardHover: '#1C2128',
  border: '#30363D',
  text: '#E6EDF3',
  muted: '#8B949E',
  dim: '#6E7681',
  accent: '#2F81F4',
  success: '#3FB950',
};

const MISSION = [
  {
    icon: Lock,
    emoji: '🔒',
    title: 'Secure Escrow',
    body: 'Your money is held safely until you confirm receipt — never released to the other party before you are happy.',
  },
  {
    icon: Truck,
    emoji: '🚚',
    title: 'Integrated Courier',
    body: 'We book Courier Guy automatically on your behalf, with live tracking from collection to your door.',
  },
  {
    icon: Scale,
    emoji: '⚖️',
    title: 'Fair Disputes',
    body: 'AI-powered dispute resolution with human oversight, so every case is handled quickly and fairly.',
  },
];

const STATS = [
  { icon: ShieldCheck, title: 'Secured by TradeSafe', sub: 'Standard Bank oversight' },
  { icon: BadgeCheck, title: '256-bit encryption', sub: 'Bank-grade protected payments' },
  { icon: MapPin, title: 'Proudly South African', sub: 'Built and operated locally' },
];

const STEPS = [
  {
    icon: Handshake,
    emoji: '🤝',
    title: 'Agree on terms',
    body: 'Both parties confirm the transaction details and price.',
  },
  {
    icon: Wallet,
    emoji: '💰',
    title: 'Buyer pays securely',
    body: 'Money is held in escrow by TradeSafe, overseen by Standard Bank.',
  },
  {
    icon: CheckCircle2,
    emoji: '✅',
    title: 'Seller delivers, buyer confirms',
    body: 'Funds release only when the buyer confirms receipt.',
  },
];

const FAQS = [
  {
    q: 'Is my money safe?',
    a: 'Yes. Funds are held by TradeSafe, regulated and overseen by Standard Bank. We never touch your money.',
  },
  {
    q: 'What does it cost?',
    a: 'TrustTrade charges 2% per transaction. A bank processing fee is added by the payment provider depending on your payment method — EFT has no extra fee, Ozow adds ~1.7%, and card adds ~3.85%. You always see the exact total before you pay — no surprises.',
  },
  {
    q: 'What if something goes wrong?',
    a: 'Raise a dispute. Our AI reviews the evidence and a human admin makes the final decision.',
  },
  {
    q: 'How long does payout take?',
    a: 'Same day or next business day after the buyer confirms receipt.',
  },
];

const TRUST_BADGES = [
  { icon: ShieldCheck, label: 'TradeSafe', sub: 'Escrow partner' },
  { icon: Building2, label: 'Standard Bank', sub: 'Oversight' },
  { icon: Package, label: 'Courier Guy', sub: 'Delivery partner' },
];

export default function AboutPage() {
  return (
    <div className="about-page" style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <style>{`
        /* The global stylesheet sets all h1–h6 to a dark colour, which is unreadable
           on this dark page. Force every heading inside the About page to light text;
           the muted section labels keep their own inline colour (inline beats this). */
        .about-page h1, .about-page h2, .about-page h3,
        .about-page h4, .about-page h5, .about-page h6 { color: ${C.text}; }
        .about-wrap { max-width: 980px; margin: 0 auto; padding: 0 20px; }
        .about-mission-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .about-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .about-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .about-badge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .about-founder { display: grid; grid-template-columns: 120px 1fr; gap: 28px; align-items: start; }
        .about-card { transition: border-color .15s ease, background .15s ease, transform .15s ease; }
        .about-card:hover { border-color: #3d4757; background: ${C.cardHover}; transform: translateY(-2px); }
        @media (max-width: 760px) {
          .about-mission-grid { grid-template-columns: 1fr; }
          .about-stats-grid { grid-template-columns: 1fr; }
          .about-steps-grid { grid-template-columns: 1fr; }
          .about-badge-grid { grid-template-columns: 1fr; }
          .about-founder { grid-template-columns: 1fr; gap: 18px; justify-items: center; text-align: center; }
          .about-hero-h1 { font-size: 34px !important; }
        }
      `}</style>

      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="about-wrap" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.muted, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <TrustTradeLogo size="small" showText dark />
        </div>
      </nav>

      {/* Hero */}
      <section className="about-wrap" style={{ paddingTop: 72, paddingBottom: 48, textAlign: 'center' }}>
        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, background: 'rgba(47,129,244,0.12)', border: '1px solid rgba(47,129,244,0.25)', borderRadius: 999, padding: '6px 14px', marginBottom: 24 }}>
          Our Story
        </span>
        <h1 className="about-hero-h1" style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '0 auto 18px', maxWidth: 760 }}>
          Built to protect South African buyers and sellers
        </h1>
        <p style={{ fontSize: 19, color: C.muted, lineHeight: 1.6, margin: '0 auto', maxWidth: 560 }}>
          A personal mission to end marketplace scams.
        </p>
      </section>

      {/* Founder story */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <div className="about-card about-founder" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '34px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 104, height: 104, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #2F81F4 0%, #1F6FEB 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '0.02em',
              boxShadow: '0 8px 28px rgba(47,129,244,0.35)',
            }}>
              MR
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>Marnich Roets</h2>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.accent, margin: '0 0 20px' }}>Founder, TrustTrade</p>

            <div style={{ fontSize: 15.5, lineHeight: 1.75, color: '#C9D4E0' }}>
              <p style={{ margin: '0 0 16px' }}>
                In 2024, I paid R3000 for a phone on Facebook Marketplace. The seller disappeared.
                The money was gone. I was angry — not just because of the money, but because there
                was nothing I could do about it.
              </p>
              <p style={{ margin: '0 0 16px' }}>
                I searched for a solution. Something simple that South Africans could use to protect
                themselves when buying and selling online. I couldn't find anything affordable and
                easy enough for everyday people.
              </p>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>
                So I built TrustTrade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, textAlign: 'center', margin: '0 0 24px' }}>
          What we do
        </h2>
        <div className="about-mission-grid">
          {MISSION.map(({ icon: Icon, emoji, title, body }) => (
            <div key={title} className="about-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '26px 22px' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(47,129,244,0.12)', border: '1px solid rgba(47,129,244,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={C.accent} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>
                <span style={{ marginRight: 7 }}>{emoji}</span>{title}
              </h3>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="about-wrap" style={{ paddingBottom: 48 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, textAlign: 'center', margin: '0 0 24px' }}>
          How it works
        </h2>
        <div className="about-steps-grid">
          {STEPS.map(({ icon: Icon, emoji, title, body }, i) => (
            <div key={title} className="about-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '26px 22px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: 18, right: 20, fontSize: 13, fontWeight: 800, color: C.dim }}>0{i + 1}</span>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(47,129,244,0.12)', border: '1px solid rgba(47,129,244,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon size={22} color={C.accent} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
                <span style={{ marginRight: 7 }}>{emoji}</span>{title}
              </h3>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof banner */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <div style={{
          background: 'rgba(47,129,244,0.08)', border: `1px solid rgba(47,129,244,0.22)`,
          borderRadius: 16, padding: '24px 28px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 16.5, fontWeight: 600, color: C.text, lineHeight: 1.55, margin: 0 }}>
            Trusted by South Africans buying and selling everything from electronics to vehicles to freelance services.
          </p>
        </div>
      </section>

      {/* Stats / trust */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <div className="about-stats-grid">
          {STATS.map(({ icon: Icon, title, sub }) => (
            <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={C.success} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>{title}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust badges */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, textAlign: 'center', margin: '0 0 18px' }}>
          Backed by trusted partners
        </p>
        <div className="about-badge-grid">
          {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(230,237,243,0.06)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color={C.text} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{label}</p>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="about-wrap" style={{ paddingBottom: 56 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, textAlign: 'center', margin: '0 0 24px' }}>
          Frequently asked questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(({ q, a }) => (
            <div key={q} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
              <p style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 7px', color: C.text }}>{q}</p>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="about-wrap" style={{ paddingBottom: 80 }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(47,129,244,0.14) 0%, rgba(63,185,80,0.10) 100%)',
          border: `1px solid ${C.border}`, borderRadius: 20, padding: '44px 28px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 10px' }}>
            Start your first secure transaction
          </h2>
          <p style={{ fontSize: 16, color: C.muted, margin: '0 0 26px' }}>It takes 2 minutes.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Link
              to="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                background: C.accent, color: '#fff', textDecoration: 'none',
                fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 11,
                boxShadow: '0 10px 30px rgba(47,129,244,0.35)',
              }}
            >
              Get Started Free <ArrowRight size={17} />
            </Link>
            <Link
              to="/demo"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                background: 'transparent', color: C.text, textDecoration: 'none',
                fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 11,
                border: `1px solid ${C.border}`,
              }}
            >
              Try the demo <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
