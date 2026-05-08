import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck, ArrowRight, CheckCircle, Lock, Shield,
  CreditCard, AlertTriangle, Clock, Banknote, BadgeCheck,
  WalletCards, FileCheck2, PackageCheck, Landmark, Zap,
  Fingerprint, Activity, RadioTower, CircleDollarSign,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TrustLogo from '../components/TrustLogo';

const DARK_BG = '#07111f';
const CARD_BG = '#0b1627';
const BORDER = '#1d3652';
const BLUE = '#38bdf8';
const GREEN = '#10b981';
const TEXT = '#f8fafc';
const MUTED = '#9fb1c7';

const steps = [
  {
    title: 'Buyer creates transaction',
    desc: 'A protected deal is created with item details, price, and seller payout information.',
    icon: FileCheck2,
  },
  {
    title: 'Buyer pays into escrow',
    desc: 'Payment is secured while TrustTrade monitors the transaction status.',
    icon: WalletCards,
  },
  {
    title: 'Seller delivers',
    desc: 'The seller ships or hands over the item while funds remain protected.',
    icon: PackageCheck,
  },
  {
    title: 'Funds released',
    desc: 'Once delivery is confirmed, funds are released to the seller payout account.',
    icon: CircleDollarSign,
  },
];

const trustPoints = [
  'Funds only released when buyer confirms delivery',
  'South African bank payout after successful release',
  'Dispute path available before funds leave escrow',
];

const whyCards = [
  {
    icon: AlertTriangle,
    title: 'Stops payment-first risk',
    body: "Buyers do not need to send money directly to a stranger before the item is delivered.",
    tone: '#f59e0b',
  },
  {
    icon: Shield,
    title: 'Protects both sides',
    body: 'Sellers see a serious buyer, buyers know funds are held until the deal is completed.',
    tone: BLUE,
  },
  {
    icon: CheckCircle,
    title: 'Clear release moment',
    body: 'Delivery confirmation is the clean handoff between escrow protection and seller payout.',
    tone: GREEN,
  },
];

const trustStrip = [
  { icon: ShieldCheck, label: 'Escrow-first protection' },
  { icon: BadgeCheck, label: 'Verified user flow' },
  { icon: Landmark, label: 'SA banking ready' },
  { icon: Clock, label: 'Dispute support path' },
];

function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

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
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const fadeUp = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    show: { opacity: 1, y: 0 },
  };

  const stagger = reduceMotion ? {} : { show: { transition: { staggerChildren: 0.11 } } };

  if (loading) {
    return (
      <div style={{ background: DARK_BG }} className="min-h-screen flex items-center justify-center">
        <div style={{ borderColor: BLUE }} className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: DARK_BG, fontFamily: "'Space Grotesk', sans-serif", color: TEXT }} className="min-h-screen overflow-hidden">

      <nav style={{ background: 'rgba(7, 17, 31, 0.82)', borderBottom: `1px solid ${BORDER}` }} className="sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <TrustLogo size="small" dark />
            <div className="flex items-center gap-3">
              <button
                onClick={handleGetStarted}
                style={{ color: MUTED }}
                className="text-sm font-medium px-4 py-2 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                data-testid="nav-login-btn"
              >
                Log In
              </button>
              <button
                onClick={handleGetStarted}
                style={{ background: BLUE, color: DARK_BG }}
                className="text-sm font-semibold px-4 py-2 transition-all hover:shadow-[0_0_28px_rgba(56,189,248,0.35)] focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                data-testid="nav-signup-btn"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative px-4 pt-16 pb-20 sm:pt-20 lg:pt-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-sky-500/20 blur-[120px]" />
          <div className="absolute right-[-120px] top-32 h-80 w-80 rounded-full bg-emerald-400/15 blur-[90px]" />
          <div className="absolute left-[-140px] bottom-0 h-72 w-72 rounded-full bg-blue-700/20 blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.04fr_0.96fr] gap-12 lg:gap-16 items-center">
            <motion.div
              variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } } }}
              initial="hidden"
              animate="show"
              className="relative z-10"
            >
              <motion.div
                variants={fadeUp}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                style={{ background: 'rgba(14, 165, 233, 0.1)', border: '1px solid rgba(56,189,248,0.28)', color: BLUE, fontFamily: "'JetBrains Mono', monospace" }}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-[0_0_32px_rgba(56,189,248,0.16)]"
              >
                <motion.span
                  animate={reduceMotion ? {} : { scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                </motion.span>
                SECURE ESCROW FOR SOUTH AFRICA
              </motion.div>

              <motion.h1
                variants={fadeUp}
                transition={{ duration: 0.65, ease: 'easeOut' }}
                style={{ color: TEXT, fontFamily: "'Space Grotesk', sans-serif" }}
                className="mt-7 max-w-4xl text-4xl font-bold leading-[1.02] sm:text-5xl lg:text-6xl"
                data-testid="hero-headline"
              >
                Trade online with escrow protection built for serious buyers and sellers.
              </motion.h1>

              <motion.p variants={fadeUp} transition={{ duration: 0.65, ease: 'easeOut' }} style={{ color: MUTED }} className="mt-6 max-w-2xl text-lg leading-8">
                TrustTrade holds payment securely until delivery is confirmed, helping both sides complete high-value marketplace deals with confidence.
              </motion.p>

              <motion.div variants={stagger} className="mt-8 grid gap-3 sm:grid-cols-3">
                {trustPoints.map((point) => (
                  <motion.div key={point} variants={fadeUp} style={{ border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(15, 23, 42, 0.5)' }} className="rounded-lg px-3 py-3 backdrop-blur">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                      <span style={{ color: MUTED }} className="text-sm leading-5">{point}</span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleGetStarted}
                  style={{ background: `linear-gradient(135deg, ${BLUE}, ${GREEN})`, color: '#03111f' }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-base font-bold transition-all hover:shadow-[0_0_38px_rgba(16,185,129,0.35)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                  data-testid="hero-cta-btn"
                >
                  Start Secure Transaction <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  style={{ border: `1px solid ${BORDER}`, color: TEXT, background: 'rgba(15, 23, 42, 0.38)' }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-base font-semibold backdrop-blur transition-colors hover:border-sky-300/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                  data-testid="hero-how-it-works-btn"
                >
                  See How It Works
                </button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 28, scale: reduceMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.75, ease: 'easeOut', delay: reduceMotion ? 0 : 0.18 }}
              className="relative"
              aria-label="Example protected escrow transaction"
            >
              <FloatingIcon reduceMotion={reduceMotion} className="left-0 top-4 hidden sm:flex" icon={Fingerprint} label="ID check" />
              <FloatingIcon reduceMotion={reduceMotion} className="right-2 top-16 hidden sm:flex" icon={Lock} label="Locked funds" delay={0.3} />
              <FloatingIcon reduceMotion={reduceMotion} className="bottom-10 left-8 hidden sm:flex" icon={RadioTower} label="Live status" delay={0.6} />

              <div className="relative mx-auto max-w-lg rounded-[2rem] border border-sky-300/20 bg-slate-950/70 p-3 shadow-[0_28px_100px_rgba(8,47,73,0.48)] backdrop-blur-xl">
                <motion.div
                  animate={reduceMotion ? {} : { boxShadow: ['0 0 0 rgba(56,189,248,0)', '0 0 64px rgba(56,189,248,0.16)', '0 0 0 rgba(56,189,248,0)'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_38%),linear-gradient(145deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-5 sm:p-6"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <p style={{ color: MUTED }} className="text-xs">Protected transaction</p>
                      <p className="mt-1 text-lg font-bold text-white">MacBook Pro M3</p>
                    </div>
                    <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      FUNDS SECURED
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Buyer payment</p>
                          <p style={{ color: MUTED }} className="text-xs">Held by TrustTrade</p>
                        </div>
                      </div>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-sm font-bold text-white">R 24,500</p>
                    </div>

                    <div className="space-y-4">
                      {['Payment verified', 'Seller delivery pending', 'Release locked'].map((label, index) => (
                        <div key={label} className="flex items-center gap-3">
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full ${index === 1 ? 'bg-sky-400/15 text-sky-200' : 'bg-emerald-400/15 text-emerald-200'}`}>
                            {index === 1 ? <Activity className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          </div>
                          <div className="h-px flex-1 bg-white/10" />
                          <span style={{ color: index === 1 ? BLUE : MUTED }} className="text-xs font-medium">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MiniMetric label="Buyer risk" value="Reduced" tone={GREEN} />
                    <MiniMetric label="Seller payout" value="Queued" tone={BLUE} />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }} className="bg-slate-950/50 py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustStrip.map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <item.icon className="h-5 w-5 text-sky-300" />
                <span style={{ color: MUTED }} className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative px-4 py-20 sm:py-24">
        <div className="absolute inset-x-0 top-12 -z-10 mx-auto h-72 max-w-4xl rounded-full bg-emerald-500/10 blur-[100px]" />
        <div className="max-w-7xl mx-auto">
          <SectionHeader eyebrow="// ESCROW FLOW" title="Escrow Protection in 4 Steps" subtitle="A clear, animated path from deal creation to seller payout." />

          <motion.ol
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="relative mt-12 grid gap-4 lg:grid-cols-4"
            aria-label="TrustTrade escrow flow steps"
          >
            {steps.map((step, index) => (
              <motion.li key={step.title} variants={fadeUp} transition={{ duration: 0.5, ease: 'easeOut' }} className="relative">
                {index < steps.length - 1 && (
                  <div className="absolute left-[calc(50%+2rem)] top-12 hidden h-px w-[calc(100%-4rem)] bg-gradient-to-r from-sky-300/50 to-emerald-300/20 lg:block" />
                )}
                <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-sky-300/30 hover:bg-white/[0.065]">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-200 ring-1 ring-sky-300/20">
                      <step.icon className="h-6 w-6" />
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-semibold text-emerald-200">0{index + 1}</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{step.title}</h3>
                  <p style={{ color: MUTED }} className="mt-3 text-sm leading-6">{step.desc}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${BORDER}` }} className="px-4 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <SectionHeader eyebrow="// WHY TRUSTTRADE" title="Built for marketplace deals where trust matters" subtitle="A premium escrow experience for South African buyers and sellers moving real money." />

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {whyCards.map((item) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-xl"
              >
                <div style={{ color: item.tone, background: `${item.tone}1c`, border: `1px solid ${item.tone}45` }} className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p style={{ color: MUTED }} className="mt-3 text-sm leading-6">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-semibold tracking-widest">// LIVE PROTECTION</p>
              <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">Every deal has a visible protection state.</h2>
              <p style={{ color: MUTED }} className="mt-5 text-base leading-7">
                The homepage now reflects the product promise: payment locked, delivery tracked, and release controlled by confirmation.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(15,23,42,0.42)] backdrop-blur-xl">
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-slate-950/70 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-200">
                      <Lock className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Live transaction protection</h3>
                      <p style={{ color: MUTED }} className="text-sm">Escrow state: funds secured</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    ACTIVE
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    ['Payment collected', 'complete', GREEN],
                    ['Delivery confirmation', 'waiting', BLUE],
                    ['Seller payout', 'locked', '#94a3b8'],
                  ].map(([label, status, tone]) => (
                    <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                      <span className="text-sm font-medium text-white">{label}</span>
                      <span style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-semibold uppercase">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }} className="px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Banknote, title: 'SA-ready payouts', body: 'Designed around local buyer and seller expectations.' },
              { icon: Fingerprint, title: 'Trust signals', body: 'Clear transaction states reduce uncertainty before release.' },
              { icon: ShieldCheck, title: 'Secure by design', body: 'Funds stay protected until the agreed outcome is reached.' },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <item.icon className="h-6 w-6 flex-shrink-0 text-emerald-300" />
                <div>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p style={{ color: MUTED }} className="mt-1 text-sm leading-6">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:py-24">
        <div className="absolute inset-x-0 bottom-0 -z-10 mx-auto h-80 max-w-5xl rounded-full bg-sky-500/10 blur-[110px]" />
        <div className="max-w-4xl mx-auto text-center">
          <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-semibold tracking-widest">// GET STARTED</p>
          <h2 className="mt-4 text-3xl font-bold text-white sm:text-5xl">Ready to trade without handing trust to chance?</h2>
          <p style={{ color: MUTED }} className="mx-auto mt-5 max-w-2xl text-lg leading-8">
            Create your first protected transaction in minutes. TrustTrade keeps the money flow visible and controlled.
          </p>
          <button
            onClick={handleGetStarted}
            style={{ background: `linear-gradient(135deg, ${BLUE}, ${GREEN})`, color: '#03111f' }}
            className="mt-9 inline-flex h-12 items-center justify-center gap-2 rounded-md px-8 text-base font-bold transition-all hover:shadow-[0_0_38px_rgba(16,185,129,0.35)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
            data-testid="cta-start-btn"
          >
            Start Secure Transaction <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${BORDER}` }} className="px-4 py-10">
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
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={scrollToHowItWorks} style={{ color: MUTED }} className="hover:text-white transition-colors">
                    How It Works
                  </button>
                </li>
                <li><a href="/escrow" style={{ color: MUTED }} className="hover:text-white transition-colors">Escrow Protection</a></li>
                <li><a href="/disputes" style={{ color: MUTED }} className="hover:text-white transition-colors">Dispute Resolution</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/terms" style={{ color: MUTED }} className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/privacy" style={{ color: MUTED }} className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/refund" style={{ color: MUTED }} className="hover:text-white transition-colors">Refund Policy</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Contact</h4>
              <a href="mailto:trusttrade.register@gmail.com" style={{ color: MUTED }} className="hover:text-white text-sm transition-colors block mb-4">
                trusttrade.register@gmail.com
              </a>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <a
                  href="https://www.facebook.com/profile.php?id=61586387282975"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BLUE, display: 'flex', alignItems: 'center' }}
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
                  style={{ color: BLUE, display: 'flex', alignItems: 'center' }}
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

function FloatingIcon({ icon: Icon, label, className, delay = 0, reduceMotion }) {
  return (
    <motion.div
      animate={reduceMotion ? {} : { y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{ border: '1px solid rgba(56,189,248,0.22)', background: 'rgba(15, 23, 42, 0.72)' }}
      className={`absolute z-10 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-sky-100 shadow-[0_12px_40px_rgba(8,47,73,0.35)] backdrop-blur-xl ${className}`}
    >
      <Icon className="h-4 w-4 text-emerald-300" />
      {label}
    </motion.div>
  );
}

function MiniMetric({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p style={{ color: MUTED }} className="text-xs">{label}</p>
      <p style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-semibold tracking-widest">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h2>
      <p style={{ color: MUTED }} className="mx-auto mt-4 max-w-2xl text-base leading-7">{subtitle}</p>
    </div>
  );
}

export default LandingPage;
