import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowRight, CheckCircle, Lock, Shield,
  CreditCard, AlertTriangle, Clock, Banknote, BadgeCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TrustLogo from '../components/TrustLogo';

const DARK_BG   = '#0A0E14';
const CARD_BG   = '#0D1117';
const BORDER    = '#1C2A3A';
const CYAN      = '#00D1FF';
const TEXT      = '#F0F6FC';
const MUTED     = '#7D8FA3';

function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, loading, navigate]);

  const handleGetStarted = () => navigate('/login');
  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div style={{ background: DARK_BG }} className="min-h-screen flex items-center justify-center">
        <div style={{ borderColor: CYAN }} className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: DARK_BG, fontFamily: "'Space Grotesk', sans-serif", color: TEXT }} className="min-h-screen">

      {/* ── Navbar ── */}
      <nav style={{ background: DARK_BG, borderBottom: `1px solid ${BORDER}` }} className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <TrustLogo size="small" dark />
            <div className="flex items-center gap-3">
              <button
                onClick={handleGetStarted}
                style={{ color: MUTED }}
                className="text-sm font-medium px-4 py-2 transition-colors hover:text-white"
                data-testid="nav-login-btn"
              >
                Log In
              </button>
              <button
                onClick={handleGetStarted}
                style={{ background: CYAN, color: DARK_BG }}
                className="text-sm font-semibold px-4 py-2 transition-opacity hover:opacity-90"
                data-testid="nav-signup-btn"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-center">

            {/* Left — copy */}
            <div>
              <div
                style={{ background: `rgba(0,209,255,0.08)`, border: `1px solid rgba(0,209,255,0.25)`, color: CYAN, fontFamily: "'JetBrains Mono', monospace" }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium mb-6"
              >
                <Shield className="w-3 h-3" />
                SECURE ESCROW · SOUTH AFRICA
              </div>

              <h1
                style={{ color: TEXT, fontFamily: "'Space Grotesk', sans-serif" }}
                className="text-4xl sm:text-5xl font-bold leading-tight mb-5"
                data-testid="hero-headline"
              >
                Buy or sell online —<br />
                <span style={{ color: CYAN }}>without getting scammed</span>
              </h1>

              <p style={{ color: MUTED }} className="text-lg mb-8 leading-relaxed">
                Your money is held securely until you receive exactly what you paid for.
                No more trusting strangers with your hard-earned cash.
              </p>

              <div className="space-y-3 mb-9">
                {[
                  'Funds only released when you confirm delivery',
                  'Bank payout within 1–2 business days',
                  '2% fee (min R5) — only pay when deal completes',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle style={{ color: CYAN }} className="w-5 h-5 flex-shrink-0" />
                    <span style={{ color: MUTED }} className="text-sm">{text}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleGetStarted}
                  style={{ background: CYAN, color: DARK_BG }}
                  className="inline-flex items-center gap-2 font-semibold px-6 h-12 text-base transition-opacity hover:opacity-90"
                  data-testid="hero-cta-btn"
                >
                  Start Secure Transaction <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  style={{ border: `1px solid ${BORDER}`, color: MUTED, background: 'transparent' }}
                  className="inline-flex items-center gap-2 px-6 h-12 text-base transition-colors hover:border-cyan-400 hover:text-white"
                  data-testid="hero-how-it-works-btn"
                >
                  See How It Works
                </button>
              </div>
            </div>

            {/* Right — mock transaction card */}
            <div className="hidden lg:block">
              <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="p-6">

                <div style={{ borderBottom: `1px solid ${BORDER}` }} className="flex items-center justify-between mb-5 pb-5">
                  <div className="flex items-center gap-3">
                    <div style={{ background: `rgba(0,209,255,0.1)`, border: `1px solid rgba(0,209,255,0.2)` }} className="w-10 h-10 flex items-center justify-center">
                      <Shield style={{ color: CYAN }} className="w-5 h-5" />
                    </div>
                    <div>
                      <p style={{ color: TEXT }} className="font-semibold text-sm">iPhone 15 Pro Max</p>
                      <p style={{ color: MUTED }} className="text-xs">Electronics · Used</p>
                    </div>
                  </div>
                  <span
                    style={{ background: `rgba(0,209,255,0.1)`, color: CYAN, border: `1px solid rgba(0,209,255,0.3)`, fontFamily: "'JetBrains Mono', monospace" }}
                    className="px-3 py-1 text-xs font-medium"
                  >
                    FUNDS SECURED
                  </span>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: MUTED }}>Item Price</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: TEXT }} className="font-medium">R 18,500.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: MUTED }}>TrustTrade Fee (2%)</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: MUTED }}>R 370.00</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${BORDER}` }} className="flex justify-between text-sm pt-3">
                    <span style={{ color: TEXT }} className="font-medium">Seller Receives</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: CYAN }} className="font-bold">R 18,130.00</span>
                  </div>
                </div>

                <div style={{ background: `rgba(0,209,255,0.05)`, border: `1px solid rgba(0,209,255,0.15)` }} className="p-3 flex items-start gap-2">
                  <Lock style={{ color: CYAN }} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p style={{ color: MUTED }} className="text-xs leading-relaxed">
                    <span style={{ color: CYAN }} className="font-medium">Protected: </span>
                    Funds held in escrow until buyer confirms receipt. Payout within 1–2 business days after release.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Badges Strip ── */}
      <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }} className="py-6">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10">
            {[
              { icon: <ShieldCheck className="h-5 w-5" />, label: '256-bit Encryption' },
              { icon: <BadgeCheck className="h-5 w-5" />, label: 'ID Verified Users' },
              { icon: <Banknote className="h-5 w-5" />, label: 'South African Banks' },
              { icon: <Clock className="h-5 w-5" />, label: '24hr Dispute Support' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ color: CYAN }}>{item.icon}</span>
                <span style={{ color: MUTED }} className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: CYAN, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs tracking-widest mb-3">
              // HOW IT WORKS
            </p>
            <h2 style={{ color: TEXT }} className="text-2xl sm:text-3xl font-bold mb-2">Escrow Protection in 4 Steps</h2>
            <p style={{ color: MUTED }}>Simple, transparent, and secure</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: BORDER }}>
            {[
              { step: '01', title: 'Create Deal',    desc: 'Seller creates a secure transaction and sends a link to the buyer', icon: <CreditCard className="w-5 h-5" /> },
              { step: '02', title: 'Buyer Pays',     desc: 'Funds are deposited and held securely in TrustTrade escrow', icon: <Lock className="w-5 h-5" /> },
              { step: '03', title: 'Item Delivered', desc: 'Seller ships the item. Buyer receives and inspects it carefully', icon: <Shield className="w-5 h-5" /> },
              { step: '04', title: 'Funds Released', desc: 'Buyer confirms receipt. Seller paid within 1–2 business days', icon: <CheckCircle className="w-5 h-5" /> },
            ].map((item, idx) => (
              <div key={idx} style={{ background: CARD_BG }} className="p-6">
                <div
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: CYAN, opacity: 0.35 }}
                  className="text-2xl font-bold mb-4"
                >
                  {item.step}
                </div>
                <div style={{ color: CYAN }} className="mb-3">{item.icon}</div>
                <h3 style={{ color: TEXT }} className="text-sm font-semibold mb-2">{item.title}</h3>
                <p style={{ color: MUTED }} className="text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why TrustTrade ── */}
      <section style={{ borderTop: `1px solid ${BORDER}` }} className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: CYAN, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs tracking-widest mb-3">
              // WHY TRUSTTRADE
            </p>
            <h2 style={{ color: TEXT }} className="text-2xl sm:text-3xl font-bold">Built for South African Traders</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px" style={{ background: BORDER }}>
            {[
              {
                icon: <AlertTriangle className="w-5 h-5" />,
                title: 'The Problem',
                body: "You pay first, hope for the best. Seller disappears. You're left with nothing and no recourse.",
                accent: '#FF4B4B',
              },
              {
                icon: <Shield className="w-5 h-5" />,
                title: 'Our Solution',
                body: 'TrustTrade holds your money until you confirm you received exactly what you paid for.',
                accent: CYAN,
              },
              {
                icon: <CheckCircle className="w-5 h-5" />,
                title: 'The Result',
                body: 'Both parties protected. Buyers get what they paid for. Sellers get paid. No more scams.',
                accent: '#00FF88',
              },
            ].map((item, i) => (
              <div key={i} style={{ background: CARD_BG }} className="p-8">
                <div
                  style={{ color: item.accent, background: `${item.accent}15`, border: `1px solid ${item.accent}30` }}
                  className="w-10 h-10 flex items-center justify-center mb-5"
                >
                  {item.icon}
                </div>
                <h3 style={{ color: TEXT }} className="text-sm font-semibold mb-2">{item.title}</h3>
                <p style={{ color: MUTED }} className="text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Escrow Explanation ── */}
      <section style={{ borderTop: `1px solid ${BORDER}` }} className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="p-8 sm:p-10">

            <div className="flex items-start gap-4 mb-8">
              <div
                style={{ background: `rgba(0,209,255,0.08)`, border: `1px solid rgba(0,209,255,0.25)` }}
                className="w-12 h-12 flex items-center justify-center flex-shrink-0"
              >
                <Lock style={{ color: CYAN }} className="w-6 h-6" />
              </div>
              <div>
                <h2 style={{ color: TEXT }} className="text-xl sm:text-2xl font-bold mb-1">Your Money Is Always Protected</h2>
                <p style={{ color: MUTED }}>Here's exactly what happens to your payment</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {[
                { n: '1', title: 'Funds held in escrow',        body: 'Your payment goes to a secure holding account, not directly to the seller' },
                { n: '2', title: 'Only released on confirmation', body: 'Seller only gets paid when you confirm the item arrived and matches description' },
                { n: '3', title: 'Dispute protection',           body: 'Problem? Raise a dispute before release. We investigate and protect your funds' },
                { n: '4', title: 'Fast bank payout',             body: 'Funds released at 10:00 and 15:00 daily. Arrives in 1–2 business days' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    style={{ background: `rgba(0,209,255,0.12)`, color: CYAN, fontFamily: "'JetBrains Mono', monospace", border: `1px solid rgba(0,209,255,0.25)` }}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  >
                    {item.n}
                  </div>
                  <div>
                    <p style={{ color: TEXT }} className="text-sm font-medium mb-1">{item.title}</p>
                    <p style={{ color: MUTED }} className="text-sm leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ borderTop: `1px solid ${BORDER}`, background: CARD_BG }} className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p style={{ color: CYAN, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs tracking-widest mb-4">
            // GET STARTED
          </p>
          <h2 style={{ color: TEXT }} className="text-2xl sm:text-3xl font-bold mb-3">Ready to trade safely?</h2>
          <p style={{ color: MUTED }} className="mb-8 text-lg">
            Create your first secure transaction in under 2 minutes. Free to sign up.
          </p>
          <button
            onClick={handleGetStarted}
            style={{ background: CYAN, color: DARK_BG }}
            className="inline-flex items-center gap-2 font-semibold px-8 h-12 text-base transition-opacity hover:opacity-90"
            data-testid="cta-start-btn"
          >
            Start Secure Transaction <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}` }} className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-4 gap-8 mb-8">

            <div className="sm:col-span-2">
              <div className="mb-4">
                <TrustLogo size="small" dark />
              </div>
              <p style={{ color: MUTED }} className="text-sm max-w-xs leading-relaxed">
                Secure escrow protection for online transactions in South Africa. Buy and sell without the scam risk.
              </p>
            </div>

            <div>
              <h4 style={{ color: TEXT }} className="text-sm font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={scrollToHowItWorks} style={{ color: MUTED }} className="hover:text-white transition-colors">
                    How It Works
                  </button>
                </li>
                <li><a href="/escrow"    style={{ color: MUTED }} className="hover:text-white transition-colors">Escrow Protection</a></li>
                <li><a href="/disputes"  style={{ color: MUTED }} className="hover:text-white transition-colors">Dispute Resolution</a></li>
              </ul>
            </div>

            <div>
              <h4 style={{ color: TEXT }} className="text-sm font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/terms"    style={{ color: MUTED }} className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/privacy"  style={{ color: MUTED }} className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/refund"   style={{ color: MUTED }} className="hover:text-white transition-colors">Refund Policy</a></li>
              </ul>
            </div>

            <div>
              <h4 style={{ color: TEXT }} className="text-sm font-semibold mb-4">Contact</h4>
              <a href="mailto:trusttrade.register@gmail.com" style={{ color: MUTED }} className="hover:text-white text-sm transition-colors block mb-4">
                trusttrade.register@gmail.com
              </a>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <a
                  href="https://www.facebook.com/profile.php?id=61586387282975"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: CYAN, display: 'flex', alignItems: 'center' }}
                  aria-label="TrustTrade on Facebook"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/trusttradesa"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: CYAN, display: 'flex', alignItems: 'center' }}
                  aria-label="TrustTrade on Instagram"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                </a>
              </div>
            </div>

          </div>

          <div style={{ borderTop: `1px solid ${BORDER}` }} className="pt-8 text-center">
            <p style={{ color: MUTED }} className="text-sm">© 2026 TrustTrade South Africa. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default LandingPage;
