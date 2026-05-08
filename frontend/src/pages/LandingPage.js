import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle,
  Clock,
  CreditCard,
  Eye,
  Fingerprint,
  HandCoins,
  Landmark,
  Lock,
  PackageCheck,
  RadioTower,
  ReceiptText,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TrustLogo from '../components/TrustLogo';

const DARK_BG = '#030711';
const PANEL = '#07111f';
const LINE = '#183454';
const BLUE = '#38bdf8';
const BLUE_DEEP = '#2563eb';
const GREEN = '#10b981';
const TEXT = '#f8fafc';
const MUTED = '#9fb4cc';

const engineSteps = [
  { label: 'Buyer payment enters escrow', icon: CreditCard, tone: BLUE },
  { label: 'Funds held securely', icon: Lock, tone: GREEN },
  { label: 'Delivery confirmed', icon: PackageCheck, tone: '#facc15' },
  { label: 'Payout unlocks', icon: Banknote, tone: '#22c55e' },
];

const trustStats = [
  { value: 'SA', label: 'Built for South African buyers and sellers', icon: Landmark },
  { value: '2%', label: 'Transparent fee model', icon: ReceiptText },
  { value: '0', label: 'Early release before confirmation', icon: Lock },
  { value: '24h', label: 'Dispute support before release', icon: Clock },
];

const buyerCards = [
  { icon: ShieldCheck, title: 'Payment protection first', body: 'Money is secured in escrow before the seller is paid.' },
  { icon: Eye, title: 'Visible transaction state', body: 'The deal shows where funds are, what is pending, and what unlocks payout.' },
  { icon: Scale, title: 'Dispute path before release', body: 'If delivery breaks down, the buyer has a support path before funds leave escrow.' },
];

const sellerCards = [
  { icon: BadgeCheck, title: 'Serious buyer signal', body: 'Escrow-backed payment shows intent before delivery happens.' },
  { icon: TrendingUp, title: 'Payout logic is clear', body: 'The seller knows what confirmation step is needed before release.' },
  { icon: HandCoins, title: 'Less payment chasing', body: 'Funds are already secured, so the transaction can focus on delivery.' },
];

const floatingBadges = [
  { label: 'Escrow locked', icon: Lock, x: '6%', y: '17%', delay: 0 },
  { label: 'Verified flow', icon: Fingerprint, x: '72%', y: '12%', delay: 0.15 },
  { label: 'SA banking', icon: Landmark, x: '76%', y: '74%', delay: 0.3 },
  { label: 'Dispute guard', icon: Scale, x: '5%', y: '72%', delay: 0.45 },
  { label: 'Release control', icon: ShieldCheck, x: '59%', y: '88%', delay: 0.6 },
];

function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 90, damping: 24, mass: 0.35 });
  const springY = useSpring(mouseY, { stiffness: 90, damping: 24, mass: 0.35 });
  const coreX = useTransform(springX, [-0.5, 0.5], reduceMotion ? [0, 0] : [-22, 22]);
  const coreY = useTransform(springY, [-0.5, 0.5], reduceMotion ? [0, 0] : [-18, 18]);
  const cardX = useTransform(springX, [-0.5, 0.5], reduceMotion ? [0, 0] : [16, -16]);
  const cardY = useTransform(springY, [-0.5, 0.5], reduceMotion ? [0, 0] : [12, -12]);
  const badgeX = useTransform(springX, [-0.5, 0.5], reduceMotion ? [0, 0] : [-10, 10]);

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

  const handleHeroMove = (event) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set((event.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  if (loading) {
    return (
      <div style={{ background: DARK_BG }} className="flex min-h-screen items-center justify-center">
        <div style={{ borderColor: BLUE }} className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: DARK_BG, color: TEXT, fontFamily: "'Space Grotesk', sans-serif" }} className="min-h-screen overflow-hidden">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#030711]/75 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <TrustLogo size="small" dark />
          <div className="flex items-center gap-3">
            <button
              onClick={handleGetStarted}
              style={{ color: MUTED }}
              className="rounded-md px-4 py-2 text-sm font-semibold transition hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
              data-testid="nav-login-btn"
            >
              Log In
            </button>
            <button
              onClick={handleGetStarted}
              className="rounded-md bg-gradient-to-r from-sky-300 to-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(16,185,129,0.34)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
              data-testid="nav-signup-btn"
            >
              Sign Up Free
            </button>
          </div>
        </div>
      </nav>

      <section onMouseMove={handleHeroMove} className="relative px-4 pb-10 pt-10 sm:pb-14 sm:pt-14 lg:min-h-[calc(100vh-4rem)]">
        <AuroraBackground reduceMotion={reduceMotion} />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="relative z-20"
          >
            <motion.div
              style={{ x: badgeX }}
              className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1.5 text-xs font-bold text-sky-100 shadow-[0_0_44px_rgba(56,189,248,0.24)] backdrop-blur-2xl"
            >
              <motion.span
                animate={reduceMotion ? {} : { scale: [1, 1.2, 1], opacity: [0.75, 1, 0.75] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/15"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              </motion.span>
              SOUTH AFRICA'S ESCROW ENGINE
            </motion.div>

            <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[0.92] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl xl:text-8xl" data-testid="hero-headline">
              Money moves only when trust is earned.
            </h1>
            <p style={{ color: MUTED }} className="mt-6 max-w-2xl text-lg leading-8 sm:text-xl">
              TrustTrade turns risky marketplace deals into protected escrow transactions, with payment locked, delivery tracked, and payout released only at the right moment.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleGetStarted}
                className="group inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-300 via-cyan-300 to-emerald-300 px-7 text-base font-bold text-slate-950 shadow-[0_22px_70px_rgba(16,185,129,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_92px_rgba(56,189,248,0.36)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                data-testid="hero-cta-btn"
              >
                Start Secure Transaction
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={scrollToHowItWorks}
                className="inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.055] px-7 text-base font-bold text-white backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-sky-300/10 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                data-testid="hero-how-it-works-btn"
              >
                See How It Works
              </button>
            </div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } }}
              className="mt-7 grid gap-3 sm:grid-cols-2"
            >
              {trustStats.map((stat) => (
                <motion.div
                  key={stat.label}
                  variants={{ hidden: { opacity: 0, y: reduceMotion ? 0 : 18 }, show: { opacity: 1, y: 0 } }}
                  className="group rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition hover:-translate-y-1 hover:border-sky-300/35 hover:bg-white/[0.08]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <stat.icon className="h-5 w-5 text-sky-300" />
                    <AnimatedStat value={stat.value} reduceMotion={reduceMotion} />
                  </div>
                  <p style={{ color: MUTED }} className="text-xs font-semibold leading-5">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <div className="relative min-h-[660px] sm:min-h-[720px] lg:min-h-[760px]">
            <EscrowEngine coreX={coreX} coreY={coreY} cardX={cardX} cardY={cardY} reduceMotion={reduceMotion} />
          </div>
        </div>
      </section>

      <section className="relative px-4 py-8">
        <ContinuityLine />
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-4">
          {[
            ['Payment enters escrow', CreditCard],
            ['Funds stay locked', Lock],
            ['Delivery confirms release', PackageCheck],
            ['Seller payout unlocks', Banknote],
          ].map(([label, Icon]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4 backdrop-blur-2xl">
              <Icon className="mb-3 h-5 w-5 text-emerald-300" />
              <p className="text-sm font-bold text-white">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative px-4 py-14 sm:py-16">
        <div className="absolute inset-x-0 top-10 -z-10 mx-auto h-80 max-w-6xl rounded-full bg-sky-500/10 blur-[110px]" />
        <SectionHeader
          eyebrow="// MONEY PROTECTION SYSTEM"
          title="A live-feeling escrow journey from payment to payout."
          subtitle="The experience is designed to show both parties exactly how trust is being created."
        />
        <div className="mx-auto mt-9 max-w-7xl">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-90px' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } } }}
            className="relative grid gap-4 lg:grid-cols-4"
          >
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reduceMotion ? 0 : 1.25, ease: 'easeOut' }}
              className="absolute left-12 right-12 top-[4.15rem] hidden h-px origin-left bg-gradient-to-r from-sky-300 via-emerald-300 to-sky-300/20 lg:block"
            />
            {engineSteps.map((step, index) => (
              <motion.div
                key={step.label}
                variants={{ hidden: { opacity: 0, y: reduceMotion ? 0 : 24 }, show: { opacity: 1, y: 0 } }}
                className="group relative rounded-[1.45rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl transition hover:-translate-y-2 hover:border-sky-300/40 hover:shadow-[0_26px_78px_rgba(8,47,73,0.32)]"
              >
                <div className="mb-5 flex items-center justify-between">
                  <motion.div
                    animate={reduceMotion ? {} : index === 1 ? { boxShadow: ['0 0 0 rgba(16,185,129,0)', '0 0 42px rgba(16,185,129,0.34)', '0 0 0 rgba(16,185,129,0)'] } : {}}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ color: step.tone, borderColor: `${step.tone}55`, background: `${step.tone}18` }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border"
                  >
                    <step.icon className="h-6 w-6" />
                  </motion.div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-white">0{index + 1}</span>
                </div>
                <h3 className="text-lg font-bold text-white">{step.label}</h3>
                <p style={{ color: MUTED }} className="mt-3 text-sm leading-6">
                  {index === 0 && 'Buyer payment is captured into the protected escrow flow.'}
                  {index === 1 && 'Funds remain locked while delivery still needs proof.'}
                  {index === 2 && 'The buyer confirms receipt or the dispute path is used.'}
                  {index === 3 && 'Only then does seller payout move to the release stage.'}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <TrustStoryGrid reduceMotion={reduceMotion} />

      <section className="relative px-4 py-14 sm:py-16">
        <div className="absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-6xl rounded-full bg-emerald-400/10 blur-[120px]" />
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">// PROTECTED UNTIL CONFIRMED</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.035em] text-white sm:text-5xl">
              The money has a visible state, not a leap of faith.
            </h2>
            <p style={{ color: MUTED }} className="mt-4 text-lg leading-8">
              TrustTrade makes the transaction feel controlled: paid, locked, delivery pending, confirmed, released. Every stage is designed to reduce uncertainty.
            </p>
          </div>
          <MoneyProtectionConsole reduceMotion={reduceMotion} />
        </div>
      </section>

      <section className="relative px-4 pb-16 pt-8 sm:pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-sky-400/16 via-[#07111f] to-emerald-400/16 p-7 shadow-[0_35px_120px_rgba(2,6,23,0.62)] sm:p-10">
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.34), transparent 26%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.24), transparent 28%)' }} />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">// START PROTECTED</p>
                <h2 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-[-0.035em] text-white sm:text-5xl">
                  Build the deal around escrow from the first click.
                </h2>
                <p style={{ color: MUTED }} className="mt-4 max-w-2xl text-lg leading-8">
                  Create a secure transaction and give both sides a cleaner way to trade.
                </p>
              </div>
              <button
                onClick={handleGetStarted}
                className="inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-300 to-emerald-300 px-8 text-base font-bold text-slate-950 shadow-[0_24px_70px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_95px_rgba(56,189,248,0.36)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                data-testid="cta-start-btn"
              >
                Start Secure Transaction <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer scrollToHowItWorks={scrollToHowItWorks} />
    </div>
  );
}

function AuroraBackground({ reduceMotion }) {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 70, -35, 0], y: [0, -45, 35, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-[-12%] top-[-28%] h-[620px] w-[620px] rounded-full bg-sky-500/26 blur-[115px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, -65, 45, 0], y: [0, 45, -25, 0], scale: [1, 0.95, 1.12, 1] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-[-12%] top-[2%] h-[620px] w-[620px] rounded-full bg-emerald-400/22 blur-[125px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 44, -52, 0], y: [0, -28, 48, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-[-22%] left-[24%] h-[560px] w-[720px] rounded-full bg-blue-700/18 blur-[130px]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.18),transparent_43%)]" />
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.2) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to bottom, black 8%, transparent 90%)',
        }}
      />
      {[...Array(18)].map((_, index) => (
        <motion.span
          key={index}
          animate={reduceMotion ? {} : { opacity: [0.1, 0.75, 0.1], x: [0, 42, 0], y: [0, -70, 0] }}
          transition={{ duration: 5 + (index % 5), repeat: Infinity, delay: index * 0.22, ease: 'easeInOut' }}
          className="absolute h-1 w-1 rounded-full bg-sky-200/70"
          style={{ left: `${8 + ((index * 17) % 86)}%`, top: `${12 + ((index * 23) % 72)}%` }}
        />
      ))}
    </div>
  );
}

function EscrowEngine({ coreX, coreY, cardX, cardY, reduceMotion }) {
  return (
    <div className="absolute inset-0">
      <motion.div style={{ x: coreX, y: coreY }} className="absolute left-1/2 top-4 h-[520px] w-[520px] -translate-x-1/2 sm:h-[620px] sm:w-[620px]">
        <FlowLine reduceMotion={reduceMotion} className="left-[12%] top-[42%] w-[33%] -rotate-6" delay={0} />
        <FlowLine reduceMotion={reduceMotion} className="right-[12%] top-[42%] w-[33%] rotate-6" delay={0.35} />
        <FlowLine reduceMotion={reduceMotion} className="left-[35%] top-[77%] w-[30%] rotate-90" delay={0.7} />
        <Node label="Buyer" icon={CreditCard} className="left-0 top-[34%]" tone={BLUE} />
        <Node label="Seller" icon={PackageCheck} className="right-0 top-[34%]" tone={GREEN} />
        <Node label="Payout" icon={Banknote} className="left-1/2 top-[84%] -translate-x-1/2" tone="#facc15" />

        <motion.div
          animate={reduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          className="absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/18 bg-[conic-gradient(from_90deg,rgba(56,189,248,0),rgba(56,189,248,0.58),rgba(16,185,129,0.52),rgba(56,189,248,0))] blur-[0.5px]"
        />
        <motion.div
          animate={reduceMotion ? {} : { rotate: -360 }}
          transition={{ duration: 38, repeat: Infinity, ease: 'linear' }}
          className="absolute left-1/2 top-1/2 h-[305px] w-[305px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20 bg-[conic-gradient(from_180deg,rgba(16,185,129,0.4),rgba(37,99,235,0.24),rgba(16,185,129,0))]"
        />
        <motion.div
          animate={reduceMotion ? {} : { scale: [1, 1.06, 1], opacity: [0.58, 0.92, 0.58] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/18 blur-[45px]"
        />
        <div className="absolute left-1/2 top-1/2 flex h-[188px] w-[188px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/16 bg-slate-950/78 shadow-[inset_0_0_64px_rgba(56,189,248,0.22),0_0_95px_rgba(56,189,248,0.3)] backdrop-blur-2xl">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-emerald-300/34 bg-gradient-to-br from-sky-300/16 to-emerald-300/12">
            <ShieldCheck className="h-14 w-14 text-emerald-200 drop-shadow-[0_0_24px_rgba(16,185,129,0.72)]" />
            <motion.div
              animate={reduceMotion ? {} : { opacity: [0.2, 0.9, 0.2], scale: [0.86, 1.25, 0.86] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-[2rem] border border-emerald-200/45"
            />
          </div>
        </div>
      </motion.div>

      {floatingBadges.map((badge) => (
        <FloatingBadge key={badge.label} {...badge} reduceMotion={reduceMotion} />
      ))}

      <motion.div style={{ x: cardX, y: cardY }} className="absolute bottom-0 left-1/2 z-20 w-full max-w-[600px] -translate-x-1/2">
        <TransactionConsole reduceMotion={reduceMotion} />
      </motion.div>
    </div>
  );
}

function FlowLine({ className, delay, reduceMotion }) {
  return (
    <div className={`absolute z-0 h-px overflow-hidden bg-sky-300/20 ${className}`}>
      <motion.div
        animate={reduceMotion ? {} : { x: ['-100%', '240%'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', delay }}
        className="h-px w-1/3 bg-gradient-to-r from-transparent via-sky-200 to-transparent"
      />
    </div>
  );
}

function Node({ label, icon: Icon, className, tone }) {
  return (
    <div className={`absolute z-10 rounded-2xl border border-white/12 bg-slate-950/72 p-3 shadow-[0_18px_60px_rgba(2,6,23,0.55)] backdrop-blur-2xl ${className}`}>
      <div className="flex items-center gap-2">
        <div style={{ color: tone, background: `${tone}18`, borderColor: `${tone}45` }} className="flex h-10 w-10 items-center justify-center rounded-xl border">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-bold text-white">{label}</span>
      </div>
    </div>
  );
}

function FloatingBadge({ icon: Icon, label, x, y, delay, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -10, 0] }}
      transition={{ opacity: { duration: 0.5, delay }, scale: { duration: 0.5, delay }, y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay } }}
      className="absolute z-30 hidden items-center gap-2 rounded-full border border-white/12 bg-slate-950/72 px-3 py-2 text-xs font-bold text-white shadow-[0_16px_55px_rgba(2,6,23,0.5)] backdrop-blur-2xl sm:flex"
      style={{ left: x, top: y }}
    >
      <Icon className="h-4 w-4 text-emerald-300" />
      {label}
    </motion.div>
  );
}

function TransactionConsole({ reduceMotion }) {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-white/[0.075] p-3 shadow-[0_36px_140px_rgba(0,0,0,0.72)] backdrop-blur-2xl">
      <div className="rounded-[1.6rem] border border-sky-300/18 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p style={{ color: MUTED }} className="text-xs font-semibold">Escrow transaction</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-white">Camera kit sale</h2>
          </div>
          <motion.div
            animate={reduceMotion ? {} : { scale: [1, 1.05, 1], boxShadow: ['0 0 0 rgba(16,185,129,0)', '0 0 38px rgba(16,185,129,0.35)', '0 0 0 rgba(16,185,129,0)'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-3 py-1.5 text-xs font-bold text-emerald-100"
          >
            FUNDS SECURED
          </motion.div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MiniMetric label="Amount" value="R 18,500" icon={WalletCards} tone={BLUE} />
          <MiniMetric label="Fee" value="2%" icon={ReceiptText} tone={GREEN} />
          <MiniMetric label="Release" value="Locked" icon={Lock} tone="#facc15" />
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          {[
            ['Payment captured', 'complete', CheckCircle, GREEN],
            ['Escrow shield active', 'locked', Shield, BLUE],
            ['Delivery confirmation', 'pending', PackageCheck, '#facc15'],
            ['Seller payout', 'waiting', Banknote, '#94a3b8'],
          ].map(([label, state, Icon, tone], index) => (
            <div key={label} className="relative flex items-center gap-3">
              {index < 3 && <div className="absolute left-4 top-8 h-5 w-px bg-gradient-to-b from-sky-300/45 to-emerald-300/20" />}
              <motion.div
                animate={reduceMotion ? {} : state === 'locked' ? { scale: [1, 1.12, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ color: tone, borderColor: `${tone}55`, background: `${tone}16` }}
                className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border"
              >
                <Icon className="h-4 w-4" />
              </motion.div>
              <div className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-white/8 bg-slate-950/34 px-3 py-2">
                <span className="truncate text-sm font-semibold text-white">{label}</span>
                <span style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] font-bold uppercase">{state}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-2 flex items-center justify-between">
        <Icon style={{ color: tone }} className="h-4 w-4" />
        <span style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-sm font-bold">{value}</span>
      </div>
      <p style={{ color: MUTED }} className="text-xs font-semibold">{label}</p>
    </div>
  );
}

function AnimatedStat({ value, reduceMotion }) {
  return (
    <motion.span
      animate={reduceMotion ? {} : { opacity: [0.86, 1, 0.86], y: [0, -2, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
      className="text-2xl font-bold text-white"
    >
      {value}
    </motion.span>
  );
}

function ContinuityLine() {
  return (
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
  );
}

function TrustStoryGrid({ reduceMotion }) {
  return (
    <section className="relative px-4 py-14 sm:py-16">
      <ContinuityLine />
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
        <StoryPanel eyebrow="// BUYERS" title="Why buyers trust TrustTrade" cards={buyerCards} accent={BLUE} reduceMotion={reduceMotion} />
        <StoryPanel eyebrow="// SELLERS" title="Why sellers trust TrustTrade" cards={sellerCards} accent={GREEN} reduceMotion={reduceMotion} />
      </div>
    </section>
  );
}

function StoryPanel({ eyebrow, title, cards, accent, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.075] to-white/[0.035] p-5 shadow-[0_28px_95px_rgba(2,6,23,0.38)] backdrop-blur-2xl sm:p-6"
    >
      <p style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-white">{title}</h2>
      <div className="mt-5 space-y-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.08 }}
            className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-1 hover:border-sky-300/30 hover:bg-white/[0.065]"
          >
            <div className="flex gap-4">
              <div style={{ color: accent, background: `${accent}1a`, borderColor: `${accent}44` }} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border">
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-white">{card.title}</h3>
                <p style={{ color: MUTED }} className="mt-1 text-sm leading-6">{card.body}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function MoneyProtectionConsole({ reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-[0_30px_110px_rgba(2,6,23,0.52)] backdrop-blur-2xl"
    >
      <div className="rounded-[1.55rem] border border-emerald-300/20 bg-slate-950/72 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/12 text-emerald-200">
              <RadioTower className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-white">Money protection state</h3>
              <p style={{ color: MUTED }} className="text-sm">Escrow lock currently active</p>
            </div>
          </div>
          <Zap className="h-5 w-5 text-sky-300" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {engineSteps.map((step, index) => (
            <div key={step.label} className="relative rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              {index < engineSteps.length - 1 && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, delay: index * 0.14 }}
                  className="absolute left-[3rem] right-[-1rem] top-9 hidden h-px origin-left bg-gradient-to-r from-sky-300/70 to-emerald-300/30 sm:block"
                />
              )}
              <div style={{ color: step.tone, background: `${step.tone}17`, borderColor: `${step.tone}45` }} className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                <step.icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-white">{step.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold tracking-widest">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.035em] text-white sm:text-5xl">{title}</h2>
      <p style={{ color: MUTED }} className="mx-auto mt-4 max-w-2xl text-lg leading-8">{subtitle}</p>
    </div>
  );
}

function Footer({ scrollToHowItWorks }) {
  return (
    <footer style={{ borderTop: `1px solid ${LINE}` }} className="px-4 py-10">
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

        <div style={{ borderTop: `1px solid ${LINE}` }} className="pt-8 text-center">
          <p style={{ color: MUTED }} className="text-sm">© 2026 TrustTrade South Africa. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default LandingPage;
