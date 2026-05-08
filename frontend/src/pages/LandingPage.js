import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck, ArrowRight, CheckCircle, Lock, Shield,
  CreditCard, AlertTriangle, Clock, Banknote, BadgeCheck,
  WalletCards, FileCheck2, PackageCheck, Landmark, Zap,
  Fingerprint, Activity, RadioTower, CircleDollarSign,
  Eye, ScanLine, Sparkles, TrendingUp, HandCoins, Scale,
  ReceiptText, ChevronRight, Layers3, KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TrustLogo from '../components/TrustLogo';

const DARK_BG = '#050b16';
const DEEP_BG = '#08111f';
const CARD_BG = '#0c1728';
const BORDER = '#1f3b58';
const BLUE = '#38bdf8';
const BLUE_DARK = '#2563eb';
const GREEN = '#10b981';
const TEXT = '#f8fafc';
const MUTED = '#a7b8cc';

const escrowSteps = [
  {
    title: 'Buyer creates transaction',
    desc: 'Deal terms, amount, and delivery expectations are captured before payment moves.',
    icon: FileCheck2,
  },
  {
    title: 'Buyer pays into escrow',
    desc: 'Funds are secured in the TrustTrade flow instead of going straight to the seller.',
    icon: WalletCards,
  },
  {
    title: 'Seller delivers',
    desc: 'The seller delivers with confidence while the buyer can track protection status.',
    icon: PackageCheck,
  },
  {
    title: 'Funds released',
    desc: 'Payout only starts after delivery is confirmed or the correct release path is reached.',
    icon: CircleDollarSign,
  },
];

const liveTimeline = [
  { label: 'Buyer payment verified', detail: 'R 24,500 secured', icon: CreditCard, tone: GREEN, state: 'complete' },
  { label: 'Escrow protection active', detail: 'Release locked', icon: ShieldCheck, tone: BLUE, state: 'active' },
  { label: 'Delivery confirmation', detail: 'Awaiting buyer', icon: PackageCheck, tone: '#facc15', state: 'pending' },
  { label: 'Seller payout', detail: 'Unlocks after confirmation', icon: Banknote, tone: '#94a3b8', state: 'locked' },
];

const floatingBadges = [
  { label: 'Funds secured', icon: Lock, className: 'left-0 top-8', delay: 0 },
  { label: 'SA banking ready', icon: Landmark, className: 'right-0 top-20', delay: 0.35 },
  { label: 'Delivery protected', icon: PackageCheck, className: 'left-6 bottom-20', delay: 0.7 },
  { label: 'Dispute path before release', icon: Scale, className: 'right-4 bottom-6', delay: 1.05 },
];

const trustStats = [
  { value: 'SA', label: 'Built for South African buyers and sellers', icon: Landmark },
  { value: '2%', label: 'Transparent TrustTrade fee', icon: ReceiptText },
  { value: '0', label: 'Funds released before confirmation', icon: Lock },
  { value: '24h', label: 'Dispute support path before release', icon: Clock },
];

const buyerTrust = [
  { icon: Lock, title: 'Money does not go straight to strangers', body: 'Payment is protected while delivery is still unresolved.' },
  { icon: Eye, title: 'Clear status from payment to release', body: 'The buyer can see whether the transaction is paid, delivered, disputed, or released.' },
  { icon: Scale, title: 'Dispute support before release', body: 'If the deal breaks down, the buyer has a path before funds leave escrow.' },
];

const sellerTrust = [
  { icon: BadgeCheck, title: 'Serious buyers stand out', body: 'A paid escrow transaction gives sellers stronger confidence before delivery.' },
  { icon: TrendingUp, title: 'Payout path is visible', body: 'The seller can understand what needs to happen before funds are released.' },
  { icon: HandCoins, title: 'No awkward payment chasing', body: 'The money is already secured, so the deal can focus on delivery and confirmation.' },
];

const moneyFlow = [
  { label: 'Buyer pays', icon: CreditCard },
  { label: 'Escrow locks funds', icon: Shield },
  { label: 'Delivery confirmed', icon: PackageCheck },
  { label: 'Seller payout starts', icon: Banknote },
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
    hidden: { opacity: 0, y: reduceMotion ? 0 : 28 },
    show: { opacity: 1, y: 0 },
  };

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
  };

  if (loading) {
    return (
      <div style={{ background: DARK_BG }} className="min-h-screen flex items-center justify-center">
        <div style={{ borderColor: BLUE }} className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: DARK_BG, fontFamily: "'Space Grotesk', sans-serif", color: TEXT }} className="min-h-screen overflow-hidden">
      <nav style={{ background: 'rgba(5, 11, 22, 0.78)', borderBottom: `1px solid ${BORDER}` }} className="sticky top-0 z-50 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <TrustLogo size="small" dark />
            <div className="flex items-center gap-3">
              <button
                onClick={handleGetStarted}
                style={{ color: MUTED }}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                data-testid="nav-login-btn"
              >
                Log In
              </button>
              <button
                onClick={handleGetStarted}
                style={{ background: `linear-gradient(135deg, ${BLUE}, ${GREEN})`, color: '#03111f' }}
                className="rounded-md px-4 py-2 text-sm font-bold transition-all hover:shadow-[0_0_30px_rgba(56,189,248,0.36)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                data-testid="nav-signup-btn"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative px-4 pb-16 pt-14 sm:pb-20 sm:pt-20 lg:min-h-[calc(100vh-4rem)] lg:pb-24">
        <HeroMesh reduceMotion={reduceMotion} />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="relative z-10"
            >
              <motion.div
                variants={fadeUp}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-100 shadow-[0_0_40px_rgba(56,189,248,0.22)] backdrop-blur-xl"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                <motion.span
                  animate={reduceMotion ? {} : { scale: [1, 1.18, 1], opacity: [0.78, 1, 0.78] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/15"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
                </motion.span>
                PREMIUM ESCROW PROTECTION
              </motion.div>

              <motion.h1
                variants={fadeUp}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="mt-7 max-w-4xl text-5xl font-bold leading-[0.98] tracking-[-0.025em] text-white sm:text-6xl lg:text-7xl"
                data-testid="hero-headline"
              >
                The safer way to buy and sell high-value items online.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ color: MUTED }}
                className="mt-6 max-w-2xl text-lg leading-8 sm:text-xl"
              >
                TrustTrade locks payment in escrow, protects both sides during delivery, and releases funds only when the transaction reaches the right confirmation point.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleGetStarted}
                  style={{ background: `linear-gradient(135deg, ${BLUE}, ${GREEN})`, color: '#03111f' }}
                  className="group inline-flex h-13 min-h-[3.25rem] items-center justify-center gap-2 rounded-lg px-7 text-base font-bold shadow-[0_22px_55px_rgba(16,185,129,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_25px_70px_rgba(56,189,248,0.34)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                  data-testid="hero-cta-btn"
                >
                  Start Secure Transaction
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  style={{ border: `1px solid rgba(148, 163, 184, 0.25)`, color: TEXT, background: 'rgba(15, 23, 42, 0.44)' }}
                  className="inline-flex h-13 min-h-[3.25rem] items-center justify-center gap-2 rounded-lg px-7 text-base font-semibold backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-sky-300/70 hover:bg-sky-400/10 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                  data-testid="hero-how-it-works-btn"
                >
                  See How It Works
                </button>
              </motion.div>

              <motion.div variants={stagger} className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {trustStats.map((stat) => (
                  <motion.div
                    key={stat.label}
                    variants={fadeUp}
                    className="group rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-sky-300/30 hover:bg-white/[0.075]"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <stat.icon className="h-5 w-5 text-sky-300" />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-2xl font-bold text-white">{stat.value}</span>
                    </div>
                    <p style={{ color: MUTED }} className="text-xs font-medium leading-5">{stat.label}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            <div className="relative min-h-[640px] lg:min-h-[700px]">
              <EscrowOrb reduceMotion={reduceMotion} />
              {floatingBadges.map((badge) => (
                <FloatingBadge key={badge.label} {...badge} reduceMotion={reduceMotion} />
              ))}
              <HeroTransactionCard reduceMotion={reduceMotion} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }} className="relative bg-slate-950/40 px-4 py-7">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-4">
          {[
            ['Escrow-first money flow', ShieldCheck],
            ['Confirmation before release', Lock],
            ['Transparent transaction states', Activity],
            ['Built for local marketplace trade', Landmark],
          ].map(([label, Icon]) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
              <Icon className="h-5 w-5 text-emerald-300" />
              <span style={{ color: MUTED }} className="text-sm font-semibold">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative px-4 py-20 sm:py-24">
        <div className="absolute inset-x-0 top-20 -z-10 mx-auto h-80 max-w-5xl rounded-full bg-sky-500/10 blur-[110px]" />
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="// ESCROW FLOW"
            title="Four steps. One protected money path."
            subtitle="The transaction is designed around a simple rule: payment is secured first, then released only after the right confirmation."
          />

          <motion.ol
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-90px' }}
            className="relative mt-12 grid gap-4 lg:grid-cols-4"
            aria-label="TrustTrade escrow flow steps"
          >
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reduceMotion ? 0 : 1.3, ease: 'easeOut' }}
              className="absolute left-10 right-10 top-[4.1rem] hidden h-px origin-left bg-gradient-to-r from-sky-300 via-emerald-300 to-sky-300/40 lg:block"
            />
            {escrowSteps.map((step, index) => (
              <motion.li key={step.title} variants={fadeUp} transition={{ duration: 0.55, ease: 'easeOut' }} className="relative">
                <div className="group h-full rounded-[1.35rem] border border-white/10 bg-gradient-to-b from-white/[0.075] to-white/[0.035] p-5 backdrop-blur-2xl transition-all hover:-translate-y-2 hover:border-sky-300/35 hover:shadow-[0_24px_70px_rgba(8,47,73,0.28)]">
                  <div className="mb-6 flex items-center justify-between">
                    <motion.div
                      animate={reduceMotion ? {} : index === 1 ? { boxShadow: ['0 0 0 rgba(56,189,248,0)', '0 0 35px rgba(56,189,248,0.28)', '0 0 0 rgba(56,189,248,0)'] } : {}}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-400/10 text-sky-100"
                    >
                      <step.icon className="h-6 w-6" />
                    </motion.div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-bold text-emerald-100">0{index + 1}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  <p style={{ color: MUTED }} className="mt-3 text-sm leading-6">{step.desc}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      <SplitTrustSection
        eyebrow="// BUYER CONFIDENCE"
        title="Why buyers trust TrustTrade"
        subtitle="Buyers get a safer way to pay because the money is protected while delivery is still being proven."
        cards={buyerTrust}
        accent={BLUE}
        reverse={false}
        reduceMotion={reduceMotion}
      />

      <SplitTrustSection
        eyebrow="// SELLER CONFIDENCE"
        title="Why sellers trust TrustTrade"
        subtitle="Sellers get a serious transaction signal before handing over the item, with a clear payout path after confirmation."
        cards={sellerTrust}
        accent={GREEN}
        reverse
        reduceMotion={reduceMotion}
      />

      <section className="relative px-4 py-20 sm:py-24">
        <div className="absolute inset-x-0 top-16 -z-10 mx-auto h-96 max-w-6xl rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div>
              <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">// WHAT HAPPENS TO YOUR MONEY</p>
              <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-5xl">Protected by escrow until delivery is confirmed.</h2>
              <p style={{ color: MUTED }} className="mt-5 text-lg leading-8">
                TrustTrade makes the payment state visible. Buyers know when funds are secured. Sellers know when release can happen. Both sides know what is still pending.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl shadow-[0_28px_95px_rgba(2,6,23,0.42)]"
            >
              <div className="rounded-[1.55rem] border border-sky-300/20 bg-slate-950/70 p-5 sm:p-7">
                <div className="grid gap-4 sm:grid-cols-4">
                  {moneyFlow.map((item, index) => (
                    <div key={item.label} className="relative">
                      {index < moneyFlow.length - 1 && (
                        <motion.div
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : index * 0.18 }}
                          className="absolute left-[3.4rem] right-[-1rem] top-7 hidden h-px origin-left bg-gradient-to-r from-sky-300/70 to-emerald-300/40 sm:block"
                        />
                      )}
                      <div className="relative rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/18 to-emerald-400/14 text-sky-100 ring-1 ring-sky-300/20">
                          <item.icon className="h-6 w-6" />
                        </div>
                        <p className="mt-4 text-sm font-bold text-white">{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-6 w-6 text-emerald-200" />
                      <div>
                        <h3 className="font-bold text-white">Release remains locked</h3>
                        <p style={{ color: MUTED }} className="mt-1 text-sm">Until delivery is confirmed or the correct dispute path resolves.</p>
                      </div>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                      CONFIRMATION REQUIRED
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-20 sm:pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-sky-500/14 via-slate-950 to-emerald-500/12 p-7 shadow-[0_35px_110px_rgba(8,47,73,0.42)] sm:p-10">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.36), transparent 28%), radial-gradient(circle at 82% 68%, rgba(16,185,129,0.24), transparent 30%)' }} />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">// FINAL CTA</p>
                <h2 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-5xl">Start with protected payment, not blind trust.</h2>
                <p style={{ color: MUTED }} className="mt-5 max-w-2xl text-lg leading-8">
                  Create a secure transaction and give both sides a cleaner way to complete the deal.
                </p>
              </div>
              <button
                onClick={handleGetStarted}
                style={{ background: `linear-gradient(135deg, ${BLUE}, ${GREEN})`, color: '#03111f' }}
                className="inline-flex h-13 min-h-[3.25rem] items-center justify-center gap-2 rounded-lg px-8 text-base font-bold shadow-[0_22px_60px_rgba(16,185,129,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_26px_78px_rgba(56,189,248,0.34)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                data-testid="cta-start-btn"
              >
                Start Secure Transaction <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
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

function HeroMesh({ reduceMotion }) {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 55, -25, 0], y: [0, -35, 28, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-[-14%] top-[-18%] h-[520px] w-[520px] rounded-full bg-sky-500/24 blur-[105px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, -50, 40, 0], y: [0, 35, -22, 0], scale: [1, 0.94, 1.1, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-[-10%] top-[10%] h-[520px] w-[520px] rounded-full bg-emerald-400/20 blur-[110px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 35, -35, 0], y: [0, -25, 40, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-[-20%] left-[30%] h-[520px] w-[620px] rounded-full bg-blue-700/18 blur-[120px]"
      />
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
          backgroundSize: '58px 58px',
          maskImage: 'linear-gradient(to bottom, black 10%, transparent 88%)',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.18),transparent_42%)]" />
    </div>
  );
}

function EscrowOrb({ reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="absolute left-1/2 top-3 z-0 h-[390px] w-[390px] -translate-x-1/2 sm:h-[470px] sm:w-[470px] lg:top-0"
      aria-hidden="true"
    >
      <motion.div
        animate={reduceMotion ? {} : { rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border border-sky-300/18 bg-[conic-gradient(from_90deg,rgba(56,189,248,0),rgba(56,189,248,0.5),rgba(16,185,129,0.45),rgba(56,189,248,0))] opacity-80 blur-[1px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { rotate: -360 }}
        transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-8 rounded-full border border-emerald-300/18 bg-[conic-gradient(from_180deg,rgba(16,185,129,0.42),rgba(37,99,235,0.25),rgba(16,185,129,0))]"
      />
      <motion.div
        animate={reduceMotion ? {} : { scale: [1, 1.05, 1], opacity: [0.62, 0.86, 0.62] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-16 rounded-full bg-sky-400/18 blur-[38px]"
      />
      <div className="absolute inset-24 flex items-center justify-center rounded-full border border-white/15 bg-slate-950/78 shadow-[inset_0_0_55px_rgba(56,189,248,0.22),0_0_90px_rgba(56,189,248,0.28)] backdrop-blur-xl">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-emerald-300/30 bg-gradient-to-br from-sky-300/16 to-emerald-300/12">
          <ShieldCheck className="h-14 w-14 text-emerald-200 drop-shadow-[0_0_22px_rgba(16,185,129,0.65)]" />
          <motion.div
            animate={reduceMotion ? {} : { opacity: [0.25, 0.8, 0.25], scale: [0.88, 1.18, 0.88] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-[2rem] border border-emerald-200/40"
          />
        </div>
      </div>
    </motion.div>
  );
}

function FloatingBadge({ icon: Icon, label, className, delay, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      animate={{ opacity: 1, y: reduceMotion ? 0 : [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.5, delay },
        y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay },
      }}
      className={`absolute z-20 hidden items-center gap-2 rounded-full border border-white/12 bg-slate-950/72 px-3 py-2 text-xs font-bold text-sky-50 shadow-[0_16px_50px_rgba(2,6,23,0.5)] backdrop-blur-2xl sm:flex ${className}`}
    >
      <Icon className="h-4 w-4 text-emerald-300" />
      {label}
    </motion.div>
  );
}

function HeroTransactionCard({ reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 36, rotateX: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.85, ease: 'easeOut', delay: reduceMotion ? 0 : 0.18 }}
      className="absolute bottom-0 left-1/2 z-10 w-full max-w-[560px] -translate-x-1/2 rounded-[2rem] border border-white/12 bg-white/[0.07] p-3 shadow-[0_34px_120px_rgba(2,6,23,0.72)] backdrop-blur-2xl"
    >
      <div className="rounded-[1.65rem] border border-sky-300/20 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p style={{ color: MUTED }} className="text-xs font-medium">Protected escrow deal</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.01em] text-white">iPhone 15 Pro Max</h2>
            <p style={{ color: MUTED }} className="mt-1 text-sm">Marketplace sale · Buyer paid securely</p>
          </div>
          <motion.div
            animate={reduceMotion ? {} : { scale: [1, 1.04, 1], boxShadow: ['0 0 0 rgba(16,185,129,0)', '0 0 36px rgba(16,185,129,0.32)', '0 0 0 rgba(16,185,129,0)'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-3 py-1.5 text-xs font-bold text-emerald-100"
          >
            FUNDS SECURED
          </motion.div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Escrow amount" value="R 18,500" icon={WalletCards} tone={BLUE} />
          <MetricCard label="TrustTrade fee" value="2%" icon={ReceiptText} tone={GREEN} />
          <MetricCard label="Release state" value="Locked" icon={Lock} tone="#facc15" />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Transaction timeline</h3>
            <span style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">LIVE</span>
          </div>
          <div className="space-y-4">
            {liveTimeline.map((item, index) => (
              <div key={item.label} className="relative flex gap-3">
                {index < liveTimeline.length - 1 && (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: item.state === 'complete' || item.state === 'active' ? 1 : 0.35 }}
                    transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : index * 0.18 }}
                    className="absolute left-5 top-10 h-[calc(100%+0.5rem)] w-px origin-top bg-gradient-to-b from-emerald-300/70 to-sky-300/30"
                  />
                )}
                <motion.div
                  animate={reduceMotion ? {} : item.state === 'active' ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ color: item.tone, borderColor: `${item.tone}55`, background: `${item.tone}18` }}
                  className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
                >
                  <item.icon className="h-5 w-5" />
                </motion.div>
                <div className="min-w-0 flex-1 rounded-xl border border-white/8 bg-slate-950/36 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                    <span style={{ color: item.tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] font-bold uppercase">{item.state}</span>
                  </div>
                  <p style={{ color: MUTED }} className="mt-1 text-xs">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-sky-300/16 bg-sky-300/8 p-4">
          <div className="flex items-center gap-3">
            <ScanLine className="h-5 w-5 text-sky-200" />
            <div>
              <p className="text-sm font-bold text-white">Release guard active</p>
              <p style={{ color: MUTED }} className="text-xs">Funds stay protected until delivery confirmation.</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-sky-200" />
        </div>
      </div>
    </motion.div>
  );
}

function MetricCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-3 flex items-center justify-between">
        <Icon style={{ color: tone }} className="h-4 w-4" />
        <span style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-sm font-bold">{value}</span>
      </div>
      <p style={{ color: MUTED }} className="text-xs font-medium">{label}</p>
    </div>
  );
}

function SplitTrustSection({ eyebrow, title, subtitle, cards, accent, reverse, reduceMotion }) {
  return (
    <section style={{ borderTop: `1px solid ${BORDER}` }} className="relative px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className={`grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center ${reverse ? 'lg:grid-flow-dense' : ''}`}>
          <div className={reverse ? 'lg:col-start-2' : ''}>
            <p style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">{eyebrow}</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-5xl">{title}</h2>
            <p style={{ color: MUTED }} className="mt-5 text-lg leading-8">{subtitle}</p>
          </div>

          <motion.div
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
            }}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className={`grid gap-4 ${reverse ? 'lg:col-start-1' : ''}`}
          >
            {cards.map((card, index) => (
              <motion.div
                key={card.title}
                variants={{ hidden: { opacity: 0, x: reduceMotion ? 0 : reverse ? -28 : 28 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="group rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.07] to-white/[0.035] p-5 backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-sky-300/30 hover:shadow-[0_24px_70px_rgba(8,47,73,0.26)]"
              >
                <div className="flex gap-4">
                  <div style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}45` }} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl">
                    <card.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">0{index + 1}</span>
                      <h3 className="text-lg font-bold text-white">{card.title}</h3>
                    </div>
                    <p style={{ color: MUTED }} className="mt-2 text-sm leading-6">{card.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-5xl">{title}</h2>
      <p style={{ color: MUTED }} className="mx-auto mt-4 max-w-2xl text-lg leading-8">{subtitle}</p>
    </div>
  );
}

export default LandingPage;
