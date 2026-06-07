import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Fingerprint,
  HandCoins,
  Landmark,
  Lock,
  PackageCheck,
  RadioTower,
  ReceiptText,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TrustTradeLogo from '../components/TrustTradeLogo';
import { trackSignUpClick, trackStartTransaction } from '../utils/analytics';

const DARK_BG = '#020611';
const INK = '#E6EDF3';
const MUTED = '#9fb3c8';
const BLUE = '#38bdf8';
const GREEN = '#22c55e';
const GOLD = '#facc15';
const LINE = '#183454';

const heroFlowSteps = [
  'Buyer pays',
  'TrustTrade holds funds',
  'Seller delivers',
  'Seller gets paid',
];

const flowStages = [
  {
    label: 'Buyer pays',
    detail: 'Payment captured and protected.',
    icon: 'CreditCard',
    tone: BLUE,
    state: 'captured',
  },
  {
    label: 'Payment protected',
    detail: 'Funds cannot release before confirmation.',
    icon: 'Lock',
    tone: GREEN,
    state: 'locked',
  },
  {
    label: 'Delivery proves',
    detail: 'Receipt or dispute decides the next state.',
    icon: 'PackageCheck',
    tone: GOLD,
    state: 'pending',
  },
  {
    label: 'Seller paid',
    detail: 'Payout unlocks after the right signal.',
    icon: 'Banknote',
    tone: '#34d399',
    state: 'released',
  },
];

const simulationStates = [
  { label: 'Buyer funds enter', state: 'captured', icon: 'CreditCard', tone: BLUE },
  { label: 'Payment protected', state: 'locked', icon: 'Lock', tone: GREEN },
  { label: 'Delivery verification', state: 'watching', icon: 'PackageCheck', tone: GOLD },
  { label: 'Dispute hold available', state: 'protected', icon: 'Scale', tone: '#fb7185' },
  { label: 'Payout unlock', state: 'released', icon: 'Banknote', tone: '#34d399' },
];

const proofSignals = [
  { value: 'SA', label: 'Banking-ready payment protection', icon: 'Landmark' },
  { value: 'LOCK', label: 'Payment locked until confirmed', icon: 'Lock' },
  { value: 'VERIFY', label: 'Delivery verification monitored', icon: 'Fingerprint' },
  { value: 'HOLD', label: 'Dispute protection before payout', icon: 'Scale' },
];

const buyerProof = [
  { icon: 'ShieldCheck', title: 'Payment stays protected', body: 'The seller is not paid while delivery is still unresolved.' },
  { icon: 'Scale', title: 'Disputes have a path', body: 'If the deal breaks down, the money stays protected until the case is resolved.' },
  { icon: 'Fingerprint', title: 'State is visible', body: 'Both sides can see exactly what has happened and what remains.' },
];

const sellerProof = [
  { icon: 'BadgeCheck', title: 'Serious buyer signal', body: 'A protected payment shows genuine intent before you hand over goods.' },
  { icon: 'TrendingUp', title: 'Clear release logic', body: 'The transaction tells you which confirmation unlocks payout.' },
  { icon: 'HandCoins', title: 'Less payment chasing', body: 'Funds are already secured, so the deal can focus on delivery.' },
];

const liveSignals = [
  ['Payment protection online', 'ShieldCheck'],
  ['Funds secured', 'Lock'],
  ['Delivery watch active', 'PackageCheck'],
  ['Payout held', 'Banknote'],
  ['Dispute hold armed', 'Scale'],
  ['SA payout routing', 'Landmark'],
];

function IconGlyph({ name, className, style }) {
  const props = { className, style };
  switch (name) {
    case 'BadgeCheck': return <BadgeCheck {...props} />;
    case 'Banknote': return <Banknote {...props} />;
    case 'Clock': return <Clock {...props} />;
    case 'CreditCard': return <CreditCard {...props} />;
    case 'Fingerprint': return <Fingerprint {...props} />;
    case 'HandCoins': return <HandCoins {...props} />;
    case 'Landmark': return <Landmark {...props} />;
    case 'Lock': return <Lock {...props} />;
    case 'PackageCheck': return <PackageCheck {...props} />;
    case 'ReceiptText': return <ReceiptText {...props} />;
    case 'Scale': return <Scale {...props} />;
    case 'ShieldCheck': return <ShieldCheck {...props} />;
    case 'TrendingUp': return <TrendingUp {...props} />;
    case 'WalletCards': return <WalletCards {...props} />;
    default: return <ShieldCheck {...props} />;
  }
}

function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 24, mass: 0.35 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 24, mass: 0.35 });
  const { scrollYProgress } = useScroll();
  const meshY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, -240]);
  const heroDepthX = useTransform(springX, [-0.5, 0.5], reduceMotion ? [0, 0] : [-6, 6]);
  const heroDepthY = useTransform(springY, [-0.5, 0.5], reduceMotion ? [0, 0] : [-12, 12]);
  const counterDepthX = useTransform(springX, [-0.5, 0.5], reduceMotion ? [0, 0] : [5, -5]);
  const counterDepthY = useTransform(springY, [-0.5, 0.5], reduceMotion ? [0, 0] : [8, -8]);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => {
      if (document.head.contains(link)) document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, loading, navigate]);

  const handleLoginClick = () => navigate('/login');
  const handleSignUpClick = (source) => {
    trackSignUpClick({ source });
    navigate('/login');
  };
  const handleStartTransactionClick = (source) => {
    trackStartTransaction({ source });
    navigate('/login');
  };
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
    <div
      style={{ background: DARK_BG, color: INK, fontFamily: "'Space Grotesk', sans-serif" }}
      className="tt-landing min-h-screen overflow-x-hidden"
    >
      <style>{`
        html, body, #root { overflow-x: hidden; }
        .tt-landing { width: 100%; max-width: 100vw; overflow-x: hidden; }
        .tt-hero-grid { min-width: 0; overflow: visible; }
        .tt-hero-stage { width: min(100%, 560px); min-width: 0; justify-self: center; overflow: visible; }
        .tt-hero-visual { inset: 0; overflow: visible; width: 100%; max-width: 100%; }
        .tt-visual-core { width: min(540px, 100%); height: min(540px, calc(100% - 6.25rem)); max-width: 100%; max-height: 540px; overflow: visible; }
        .tt-escrow-console { width: min(100%, 500px); max-width: 100%; }
        .tt-endpoint { max-width: min(42vw, 170px); }
        .tt-flow-svg { overflow: hidden; }

        @media (max-width: 1023px) {
          .tt-hero-copy { text-align: center; }
          .tt-hero-copy p { margin-left: auto; margin-right: auto; }
          .tt-hero-actions { justify-content: center; }
          .tt-hero-stage { width: min(100%, 560px); min-height: 660px; margin-top: 0; }
          .tt-hero-visual { position: relative !important; min-height: 660px; }
          .tt-visual-core {
            width: min(520px, calc(100vw - 2rem)) !important;
            height: min(520px, calc(100vw - 2rem)) !important;
            top: 0.75rem !important;
          }
          .tt-escrow-console { bottom: 0 !important; }
        }

        @media (max-width: 768px) {
          .tt-hero-stage { width: min(100%, 480px); min-height: 570px; }
          .tt-hero-visual { min-height: 590px; }
          .tt-visual-core {
            width: min(400px, calc(100vw - 1.5rem)) !important;
            height: min(400px, calc(100vw - 1.5rem)) !important;
          }
          .tt-visual-core > .tt-endpoint { transform: scale(0.78); transform-origin: center; }
          .tt-visual-core > .tt-endpoint:first-of-type { left: 0 !important; }
          .tt-visual-core > .tt-endpoint:nth-of-type(2) { right: 0 !important; }
          .tt-escrow-console { max-width: calc(100vw - 1.5rem); }
        }

        @media (max-width: 480px) {
          .tt-landing section { max-width: 100vw; }
          .tt-hero-stage { width: 100%; min-height: 520px; }
          .tt-hero-visual { min-height: 545px; }
          .tt-visual-core {
            width: min(340px, calc(100vw - 1rem)) !important;
            height: min(340px, calc(100vw - 1rem)) !important;
            top: 0.5rem !important;
          }
          .tt-visual-core svg { transform: scale(0.94); transform-origin: center; }
          .tt-visual-core .tt-endpoint { display: none; }
          .tt-visual-core .tt-orbit-lg {
            width: 240px !important;
            height: 240px !important;
          }
          .tt-visual-core .tt-orbit-md {
            width: 200px !important;
            height: 200px !important;
          }
          .tt-visual-core .tt-orbit-glow {
            width: 180px !important;
            height: 180px !important;
            filter: blur(34px) !important;
          }
          .tt-visual-core .tt-vault-core {
            width: 148px !important;
            height: 148px !important;
          }
          .tt-visual-core [class*="h-32"] {
            width: 86px !important;
            height: 86px !important;
          }
          .tt-visual-core [class*="h-16"] {
            width: 42px !important;
            height: 42px !important;
          }
          .tt-escrow-console {
            max-width: calc(100% - 1rem);
          }
          .tt-escrow-console > div { padding: 0.5rem !important; }
          .tt-escrow-console .tt-console-inner { padding: 0.875rem !important; }
          .tt-escrow-console h2 { font-size: 1.15rem !important; }
          .tt-escrow-console .tt-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 0.5rem !important; }
          .tt-escrow-console .tt-mini-signal { padding: 0.625rem !important; min-width: 0; }
          .tt-escrow-console .tt-state-row { gap: 0.5rem !important; }
          .tt-escrow-console .tt-state-label { font-size: 0.78rem !important; }
          .tt-escrow-console .tt-state-code { font-size: 0.58rem !important; }
          .tt-pipeline-card { min-height: auto !important; }
          .tt-pipeline-card h3 { font-size: 1.6rem !important; }
        }
      `}</style>
      <motion.div style={{ y: meshY }} className="pointer-events-none fixed inset-0 z-0">
        <CinematicMesh reduceMotion={reduceMotion} />
      </motion.div>

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#020611]/72 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <TrustTradeLogo size="small" showText dark />
          <div className="flex items-center gap-3">
            <a
              href="/about"
              style={{ color: MUTED }}
              className="hidden sm:inline-block rounded-lg px-4 py-2 text-sm font-semibold transition hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
              data-testid="nav-about-link"
            >
              About
            </a>
            <button
              onClick={handleLoginClick}
              style={{ color: MUTED }}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70"
              data-testid="nav-login-btn"
            >
              Log In
            </button>
            <button
              onClick={() => handleSignUpClick('landing_nav_signup')}
              className="rounded-lg bg-gradient-to-r from-sky-300 to-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 shadow-[0_0_34px_rgba(56,189,248,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(16,185,129,0.32)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
              data-testid="nav-signup-btn"
            >
              Sign Up Free
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section onMouseMove={handleHeroMove} className="relative px-4 pb-12 pt-12 sm:pb-16 sm:pt-16 lg:min-h-[calc(100vh-4rem)]">
          <div className="tt-hero-grid mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(480px,560px)] lg:items-center xl:grid-cols-[minmax(0,1fr)_minmax(520px,560px)]">
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="tt-hero-copy relative z-20 min-w-0"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1.5 text-xs font-bold text-sky-100 shadow-[0_0_44px_rgba(56,189,248,0.22)] backdrop-blur-2xl">
                <motion.span
                  animate={reduceMotion ? {} : { scale: [1, 1.16, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/15"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
                </motion.span>
                FACEBOOK MARKETPLACE PAYMENT PROTECTION
              </div>

              <h1 className="mt-7 max-w-4xl text-5xl font-bold leading-[0.98] text-white sm:text-6xl lg:text-[4.15rem] xl:text-[4.65rem]" data-testid="hero-headline">
                Buying from Facebook Marketplace?
                <span className="mt-2 block text-sky-100">Don&apos;t send money to strangers.</span>
              </h1>
              <p style={{ color: MUTED }} className="mt-7 max-w-2xl text-lg leading-8 sm:text-xl">
                TrustTrade holds the buyer&apos;s payment securely until delivery is confirmed. The seller only gets paid once the buyer confirms they received the item.
              </p>
              <p className="mt-5 max-w-2xl border-l-2 border-emerald-300/55 pl-4 text-base leading-7 text-sky-50/90">
                I built TrustTrade after losing R3,000 in an online scam. I know how frustrating it feels when the money is gone and there&apos;s nothing you can do.
              </p>

              <div className="tt-hero-actions mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => handleStartTransactionClick('landing_hero_cta')}
                  className="group inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-300 via-cyan-300 to-emerald-300 px-7 text-base font-bold text-slate-950 shadow-[0_22px_70px_rgba(16,185,129,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_92px_rgba(56,189,248,0.36)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
                  data-testid="hero-cta-btn"
                >
                  Start a Safe Transaction
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  className="inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-lg border border-white/14 bg-white/[0.055] px-7 text-base font-bold text-white backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-sky-300/10 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
                  data-testid="hero-how-it-works-btn"
                >
                  See How It Works
                </button>
              </div>

              <div className="mt-7 grid gap-2 rounded-lg border border-white/10 bg-white/[0.045] p-3 shadow-[0_22px_80px_rgba(2,6,23,0.35)] backdrop-blur-2xl sm:grid-cols-4">
                {heroFlowSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-2 rounded-md border border-white/8 bg-slate-950/35 px-3 py-3 text-left text-sm font-bold text-white">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-xs text-emerald-200">
                      {index + 1}
                    </span>
                    <span className="min-w-0">{step}</span>
                    {index < heroFlowSteps.length - 1 && (
                      <ArrowRight className="ml-auto hidden h-4 w-4 shrink-0 text-sky-200/70 sm:block" />
                    )}
                  </div>
                ))}
              </div>

              <LiveTrustStrip reduceMotion={reduceMotion} />
            </motion.div>

            <div className="tt-hero-stage relative min-h-[600px] sm:min-h-[700px] lg:min-h-[650px] xl:min-h-[690px]">
              <SignatureEscrowVisual
                depthX={heroDepthX}
                depthY={heroDepthY}
                counterX={counterDepthX}
                counterY={counterDepthY}
                reduceMotion={reduceMotion}
              />
            </div>
          </div>
        </section>

        <TrustRail reduceMotion={reduceMotion} />
        <EscrowPipeline reduceMotion={reduceMotion} />
        <EditorialTrustSection reduceMotion={reduceMotion} />
        <ProtectionConsole reduceMotion={reduceMotion} />
        <FinalCta handleStartTransaction={handleStartTransactionClick} />
      </main>

      <Footer scrollToHowItWorks={scrollToHowItWorks} />
    </div>
  );
}

function CinematicMesh({ reduceMotion }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 34, -22, 0], y: [0, -24, 18, 0], scale: [1, 1.035, 0.98, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-[-12%] top-[-18%] h-[560px] w-[560px] rounded-full bg-sky-500/9 blur-[180px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, -34, 28, 0], y: [0, 26, -18, 0], scale: [1, 0.98, 1.04, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-[-10%] top-[16%] h-[500px] w-[500px] rounded-full bg-emerald-400/7 blur-[185px]"
      />
      <motion.div
        animate={reduceMotion ? {} : { x: [0, 24, -32, 0], y: [0, -18, 34, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-[-16%] left-[24%] h-[390px] w-[660px] rounded-full bg-blue-700/6 blur-[195px]"
      />
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'linear-gradient(to bottom, black 2%, transparent 88%)',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.18),transparent_42%),linear-gradient(to_bottom,rgba(2,6,17,0.1),rgba(2,6,17,0.94))]" />
    </div>
  );
}

function SignatureEscrowVisual({ depthX, depthY, counterX, counterY, reduceMotion }) {
  return (
    <div className="tt-hero-visual absolute inset-0">
      <motion.div style={{ x: depthX, y: depthY }} className="tt-visual-core absolute inset-x-0 top-4 mx-auto h-[500px] w-[500px] sm:h-[560px] sm:w-[560px]">
        <ParticleField reduceMotion={reduceMotion} />
        <AnimatedFlowSvg reduceMotion={reduceMotion} />
        <FlowArc className="left-[6%] top-[39%] w-[36%] -rotate-6" delay={0} reduceMotion={reduceMotion} />
        <FlowArc className="right-[6%] top-[39%] w-[36%] rotate-6" delay={0.45} reduceMotion={reduceMotion} reverse />
        <FlowArc className="left-[36%] top-[75%] w-[30%] rotate-90" delay={0.9} reduceMotion={reduceMotion} />

        <Endpoint label="Buyer" amount="R 18,500" icon="CreditCard" className="left-[2%] top-[32%]" tone={BLUE} />
        <Endpoint label="Seller" amount="Payout ready" icon="PackageCheck" className="right-[2%] top-[32%]" tone={GREEN} />
        <Endpoint label="Release" amount="Locked" icon="Banknote" className="left-1/2 top-[84%] -translate-x-1/2" tone={GOLD} />

        <motion.div
          animate={reduceMotion ? {} : { rotate: 360 }}
          transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
          className="tt-orbit-lg absolute inset-0 m-auto h-[330px] w-[330px] rounded-full border border-sky-300/14 bg-[conic-gradient(from_90deg,rgba(56,189,248,0),rgba(56,189,248,0.48),rgba(34,197,94,0.42),rgba(250,204,21,0.18),rgba(56,189,248,0))] sm:h-[350px] sm:w-[350px]"
        />
        <motion.div
          animate={reduceMotion ? {} : { rotate: -360 }}
          transition={{ duration: 44, repeat: Infinity, ease: 'linear' }}
          className="tt-orbit-md absolute inset-0 m-auto h-[260px] w-[260px] rounded-full border border-emerald-300/18 bg-[conic-gradient(from_180deg,rgba(34,197,94,0.3),rgba(37,99,235,0.22),rgba(34,197,94,0))] sm:h-[280px] sm:w-[280px]"
        />
        <motion.div
          animate={reduceMotion ? {} : { scale: [1, 1.07, 1], opacity: [0.52, 0.92, 0.52] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          className="tt-orbit-glow absolute inset-0 m-auto h-[210px] w-[210px] rounded-full bg-sky-300/18 blur-[38px] sm:h-[230px] sm:w-[230px]"
        />
        <div className="tt-vault-core absolute left-1/2 top-1/2 flex h-[178px] w-[178px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/16 bg-slate-950/78 shadow-[inset_0_0_58px_rgba(56,189,248,0.22),0_0_80px_rgba(56,189,248,0.26)] backdrop-blur-2xl sm:h-[190px] sm:w-[190px]">
          <div className="relative flex h-32 w-32 items-center justify-center rounded-lg border border-emerald-300/34 bg-gradient-to-br from-sky-300/16 to-emerald-300/12">
            <ShieldCheck className="h-16 w-16 text-emerald-200 drop-shadow-[0_0_26px_rgba(34,197,94,0.76)]" />
            <motion.div
              animate={reduceMotion ? {} : { opacity: [0.18, 0.92, 0.18], scale: [0.86, 1.25, 0.86] }}
              transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-lg border border-emerald-200/45"
            />
          </div>
        </div>
      </motion.div>

      <motion.div style={{ x: counterX, y: counterY }} className="tt-escrow-console absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[500px]">
        <LiveEscrowConsole reduceMotion={reduceMotion} />
      </motion.div>
    </div>
  );
}

function AnimatedFlowSvg({ reduceMotion }) {
  return (
    <svg className="tt-flow-svg absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 690 690" aria-hidden="true">
      <defs>
        <linearGradient id="escrowFlowGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(56,189,248,0)" />
          <stop offset="45%" stopColor="rgba(125,211,252,0.95)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </linearGradient>
        <filter id="escrowFlowGlow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[
        'M80 300 C190 210 250 230 345 345 C445 465 520 455 610 320',
        'M96 392 C205 480 270 468 345 345 C430 210 515 215 594 385',
        'M345 610 C310 520 300 440 345 345 C390 430 402 522 345 610',
      ].map((path, index) => (
        <motion.path
          key={path}
          d={path}
          fill="none"
          stroke="url(#escrowFlowGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="70 420"
          filter="url(#escrowFlowGlow)"
          initial={false}
          animate={reduceMotion ? {} : { strokeDashoffset: [index * -120, index * -120 - 490] }}
          transition={{ duration: 4.6 + index * 0.5, repeat: Infinity, ease: 'linear' }}
          opacity="0.82"
        />
      ))}
    </svg>
  );
}

function ParticleField({ reduceMotion }) {
  return (
    <div className="absolute inset-0">
      {[...Array(28)].map((_, index) => (
        <motion.span
          key={index}
          animate={reduceMotion ? {} : { opacity: [0.08, 0.72, 0.08], x: [0, 34 + (index % 4) * 8, 0], y: [0, -55 - (index % 5) * 8, 0] }}
          transition={{ duration: 5 + (index % 6), repeat: Infinity, delay: index * 0.13, ease: 'easeInOut' }}
          className="absolute h-1 w-1 rounded-full bg-sky-200/70"
          style={{ left: `${8 + ((index * 17) % 84)}%`, top: `${10 + ((index * 23) % 78)}%` }}
        />
      ))}
    </div>
  );
}

function FlowArc({ className, delay, reduceMotion, reverse = false }) {
  return (
    <div className={`absolute z-0 h-px overflow-hidden bg-sky-300/22 ${className}`}>
      <motion.div
        animate={reduceMotion ? {} : { x: reverse ? ['240%', '-100%'] : ['-100%', '240%'] }}
        transition={{ duration: 2.25, repeat: Infinity, ease: 'linear', delay }}
        className="h-px w-1/3 bg-gradient-to-r from-transparent via-sky-100 to-transparent"
      />
    </div>
  );
}

function Endpoint({ label, amount, icon, className, tone }) {
  return (
    <div className={`tt-endpoint absolute z-10 border border-white/12 bg-slate-950/72 p-3 shadow-[0_18px_60px_rgba(2,6,23,0.55)] backdrop-blur-2xl ${className}`}>
      <div className="flex items-center gap-3">
        <div style={{ color: tone, background: `${tone}18`, borderColor: `${tone}45` }} className="flex h-11 w-11 items-center justify-center rounded-lg border">
          <IconGlyph name={icon} className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">{label}</p>
          <p style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">{amount}</p>
        </div>
      </div>
    </div>
  );
}

function LiveEscrowConsole({ reduceMotion }) {
  return (
    <div className="border border-white/12 bg-white/[0.075] p-3 shadow-[0_36px_140px_rgba(0,0,0,0.72)] backdrop-blur-2xl">
      <div className="tt-console-inner border border-sky-300/18 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p style={{ color: MUTED }} className="text-xs font-semibold">Live protected transaction</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Camera kit sale</h2>
          </div>
          <motion.div
            animate={reduceMotion ? {} : { scale: [1, 1.05, 1], boxShadow: ['0 0 0 rgba(34,197,94,0)', '0 0 38px rgba(34,197,94,0.34)', '0 0 0 rgba(34,197,94,0)'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-fit rounded-full border border-emerald-300/35 bg-emerald-300/12 px-3 py-1.5 text-xs font-bold text-emerald-100"
          >
            FUNDS SECURED
          </motion.div>
        </div>

        <div className="tt-mini-grid grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniSignal label="Amount" value="R 18,500" icon="WalletCards" tone={BLUE} />
          <MiniSignal label="Protected" value="Locked" icon="Lock" tone={GREEN} />
          <MiniSignal label="Dispute" value="Armed" icon="Scale" tone="#fb7185" />
          <MiniSignal label="Payout" value="1-2 days" icon="Banknote" tone={GOLD} />
        </div>

        <div className="mt-5">
          {simulationStates.map((stage, index) => (
            <div key={stage.label} className="tt-state-row relative flex items-center gap-3 py-2">
              {index < simulationStates.length - 1 && <div className="absolute left-4 top-10 h-5 w-px bg-gradient-to-b from-sky-300/50 to-emerald-300/20" />}
              <motion.div
                animate={reduceMotion ? {} : stage.state === 'locked' || stage.state === 'protected' ? { scale: [1, 1.12, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ color: stage.tone, borderColor: `${stage.tone}55`, background: `${stage.tone}16` }}
                className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border"
              >
                <IconGlyph name={stage.icon} className="h-4 w-4" />
              </motion.div>
              <div className="flex min-w-0 flex-1 items-center justify-between border border-white/8 bg-slate-950/34 px-3 py-2">
                <span className="tt-state-label truncate text-sm font-semibold text-white">{stage.label}</span>
                <span style={{ color: stage.tone, fontFamily: "'JetBrains Mono', monospace" }} className="tt-state-code text-[10px] font-bold uppercase">{stage.state}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniSignal({ label, value, icon, tone }) {
  return (
    <div className="tt-mini-signal border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <IconGlyph name={icon} style={{ color: tone }} className="h-4 w-4" />
        <span style={{ color: tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-sm font-bold">{value}</span>
      </div>
      <p style={{ color: MUTED }} className="text-xs font-semibold">{label}</p>
    </div>
  );
}

function LiveTrustStrip({ reduceMotion }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } }}
      className="mt-9 grid gap-x-6 gap-y-4 border-y border-white/10 py-5 sm:grid-cols-2"
    >
      {proofSignals.map((signal) => (
        <motion.div
          key={signal.label}
          variants={{ hidden: { opacity: 0, y: reduceMotion ? 0 : 16 }, show: { opacity: 1, y: 0 } }}
          className="flex items-center gap-3"
        >
          <IconGlyph name={signal.icon} className="h-5 w-5 text-sky-300" />
          <div>
            <motion.p
              animate={reduceMotion ? {} : { opacity: [0.86, 1, 0.86], y: [0, -2, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              className="text-2xl font-bold text-white"
            >
              {signal.value}
            </motion.p>
            <p style={{ color: MUTED }} className="text-xs font-semibold leading-5">{signal.label}</p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function TrustRail({ reduceMotion }) {
  return (
    <section className="relative px-4 py-6">
      <div className="mx-auto max-w-7xl border-y border-white/10 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p style={{ color: MUTED }} className="max-w-xl text-sm font-semibold">
            A continuous money state from capture to confirmation to payout.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {liveSignals.map(([label, icon], index) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.06 }}
                className="flex items-center gap-2 text-sm font-bold text-white"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <motion.span
                    animate={reduceMotion ? {} : { scale: [1, 2.2, 1], opacity: [0.75, 0, 0.75] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: index * 0.25 }}
                    className="absolute inline-flex h-full w-full rounded-full bg-emerald-300"
                  />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </span>
                <IconGlyph name={icon} className="h-4 w-4 text-sky-300" />
                {label}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EscrowPipeline({ reduceMotion }) {
  return (
    <section id="how-it-works" className="relative px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.65 }}
          >
            <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">// MONEY PROTECTION SYSTEM</p>
            <h2 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white sm:text-5xl">
              A payment pipeline with a lock at the center.
            </h2>
            <p style={{ color: MUTED }} className="mt-5 max-w-xl text-lg leading-8">
              The core interaction is simple: money flows in, payment is protected, delivery creates proof, and funds release only after the right confirmation. Bank settlement may take up to 2 business days.
            </p>
          </motion.div>

          <div className="tt-pipeline-card relative min-h-[470px] overflow-hidden border border-white/10 bg-white/[0.045] p-5 shadow-[0_36px_120px_rgba(2,6,23,0.48)] backdrop-blur-2xl sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.22),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,197,94,0.16),transparent_32%)]" />
            <div className="relative flex h-full min-h-[425px] flex-col justify-center">
              <div className="relative hidden min-h-[240px] items-center lg:block">
                <div className="absolute left-[8%] right-[8%] top-[5.2rem] h-px bg-gradient-to-r from-sky-300/30 via-emerald-300/80 to-emerald-300/25" />
                <motion.div
                  animate={reduceMotion ? {} : { left: ['8%', '92%'], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute top-[5.2rem] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100 shadow-[0_0_34px_rgba(56,189,248,0.9)]"
                />
                <div className="relative grid grid-cols-4 gap-3 pt-10">
                  {flowStages.map((stage, index) => (
                    <PipelineNode key={stage.label} stage={stage} index={index} reduceMotion={reduceMotion} />
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:hidden">
                {flowStages.map((stage, index) => (
                  <CompactPipelineNode key={stage.label} stage={stage} index={index} reduceMotion={reduceMotion} />
                ))}
              </div>

              <div className="mt-8 grid gap-6 border-t border-white/10 pt-6 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p style={{ color: MUTED }} className="text-sm font-semibold">Current protection state</p>
                  <h3 className="mt-2 text-3xl font-bold text-white">Locked until delivery confirmation</h3>
                </div>
                <motion.div
                  animate={reduceMotion ? {} : { rotate: [0, -7, 7, 0], scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-24 w-24 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-300/12 text-emerald-100 shadow-[0_0_62px_rgba(34,197,94,0.22)]"
                >
                  <Lock className="h-10 w-10" />
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelineNode({ stage, index, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay: reduceMotion ? 0 : index * 0.12 }}
      className="relative min-w-0 text-center"
    >
      <motion.div
        animate={reduceMotion ? {} : stage.state === 'released' ? { boxShadow: ['0 0 0 rgba(34,197,94,0)', '0 0 54px rgba(34,197,94,0.4)', '0 0 0 rgba(34,197,94,0)'] } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ color: stage.tone, borderColor: `${stage.tone}55`, background: `${stage.tone}14` }}
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-2xl"
      >
        <IconGlyph name={stage.icon} className="h-6 w-6" />
      </motion.div>
      <h3 className="mx-auto mt-4 max-w-[9rem] text-sm font-bold leading-snug text-white">{stage.label}</h3>
      <p style={{ color: MUTED }} className="mx-auto mt-2 max-w-[9.5rem] text-[11px] leading-5">{stage.detail}</p>
      <p style={{ color: stage.tone, fontFamily: "'JetBrains Mono', monospace" }} className="mt-3 text-[10px] font-bold uppercase">{stage.state}</p>
    </motion.div>
  );
}

function CompactPipelineNode({ stage, index, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: reduceMotion ? 0 : 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.08 }}
      className="relative flex gap-4 border-l border-white/10 pl-5"
    >
      <span style={{ background: stage.tone }} className="absolute -left-1 top-3 h-2 w-2 rounded-full" />
      <div style={{ color: stage.tone, borderColor: `${stage.tone}55`, background: `${stage.tone}14` }} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border">
        <IconGlyph name={stage.icon} className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-bold text-white">{stage.label}</h3>
        <p style={{ color: MUTED }} className="mt-1 text-sm leading-6">{stage.detail}</p>
      </div>
    </motion.div>
  );
}

function EditorialTrustSection({ reduceMotion }) {
  return (
    <section className="relative px-4 py-20 sm:py-24">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/55 to-transparent" />
      <div className="mx-auto grid max-w-7xl gap-16">
        <EditorialBlock
          eyebrow="// BUYER PROTECTION"
          title="The buyer sees control instead of hoping the seller does the right thing."
          body="Payment protection changes the emotional shape of the deal. Payment is serious, but it is not final until delivery earns release."
          proof={buyerProof}
          accent={BLUE}
          align="left"
          reduceMotion={reduceMotion}
        />
        <EditorialBlock
          eyebrow="// SELLER CONFIDENCE"
          title="The seller sees real payment intent before committing to delivery."
          body="TrustTrade gives sellers a visible payment state, so handover happens with less uncertainty and clearer payout logic."
          proof={sellerProof}
          accent={GREEN}
          align="right"
          reduceMotion={reduceMotion}
        />
      </div>
    </section>
  );
}

function EditorialBlock({ eyebrow, title, body, proof, accent, align, reduceMotion }) {
  const visual = (
    <motion.div
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65 }}
      className="relative min-h-[360px] overflow-hidden border border-white/10 bg-white/[0.04] p-6 shadow-[0_34px_120px_rgba(2,6,23,0.44)] backdrop-blur-2xl"
    >
      <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 50% 38%, ${accent}33, transparent 34%)` }} />
      <div className="relative flex h-full min-h-[310px] flex-col justify-between">
        <div className="flex items-center justify-between">
          <p style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">TRUST SIGNALS</p>
          <RadioTower style={{ color: accent }} className="h-5 w-5" />
        </div>
        <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border border-white/12 bg-slate-950/70 shadow-[inset_0_0_58px_rgba(56,189,248,0.18)]">
          <motion.div
            animate={reduceMotion ? {} : { scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ color: accent, borderColor: `${accent}55`, background: `${accent}15` }}
            className="flex h-24 w-24 items-center justify-center rounded-lg border"
          >
            <ShieldCheck className="h-12 w-12" />
          </motion.div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {proof.map((item) => (
            <div key={item.title} className="border-t border-white/10 pt-3">
              <IconGlyph name={item.icon} style={{ color: accent }} className="mb-2 h-5 w-5" />
              <p className="text-sm font-bold text-white">{item.title}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );

  const copy = (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65 }}
      className="self-center"
    >
      <p style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">{eyebrow}</p>
      <h2 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-6xl">{title}</h2>
      <p style={{ color: MUTED }} className="mt-5 max-w-2xl text-lg leading-8">{body}</p>
      <div className="mt-8 space-y-5">
        {proof.map((item) => (
          <div key={item.body} className="flex gap-4">
            <div style={{ color: accent, background: `${accent}14`, borderColor: `${accent}44` }} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border">
              <IconGlyph name={item.icon} className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p style={{ color: MUTED }} className="mt-1 text-sm leading-6">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      {align === 'right' ? visual : copy}
      {align === 'right' ? copy : visual}
    </div>
  );
}

function ProtectionConsole({ reduceMotion }) {
  return (
    <section className="relative px-4 py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">// PROTECTED UNTIL CONFIRMED</p>
          <h2 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-6xl">
            The money has a visible state, not a leap of faith.
          </h2>
          <p style={{ color: MUTED }} className="mt-5 max-w-2xl text-lg leading-8">
            Paid, locked, delivery pending, confirmed, released. Every state makes the deal feel controlled and auditable.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
          className="border border-white/10 bg-white/[0.055] p-4 shadow-[0_30px_110px_rgba(2,6,23,0.52)] backdrop-blur-2xl"
        >
          <div className="border border-emerald-300/20 bg-slate-950/72 p-5">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/12 text-emerald-200">
                  <RadioTower className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Money protection state</h3>
                  <p style={{ color: MUTED }} className="text-sm">Payment protection active</p>
                </div>
              </div>
              <Zap className="h-5 w-5 text-sky-300" />
            </div>

            <div className="relative min-h-[300px] overflow-hidden border border-white/10 bg-white/[0.035] p-5">
              <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-sky-300/70 via-emerald-300/50 to-transparent" />
              {flowStages.map((stage, index) => (
                <motion.div
                  key={stage.label}
                  initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: reduceMotion ? 0 : index * 0.1 }}
                  className="relative mb-5 flex items-start gap-4 last:mb-0"
                >
                  <div style={{ color: stage.tone, background: `${stage.tone}16`, borderColor: `${stage.tone}55` }} className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-slate-950">
                    <IconGlyph name={stage.icon} className="h-5 w-5" />
                  </div>
                  <div className="pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="font-bold text-white">{stage.label}</h4>
                      <span style={{ color: stage.tone, fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] font-bold uppercase">{stage.state}</span>
                    </div>
                    <p style={{ color: MUTED }} className="mt-1 text-sm leading-6">{stage.detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FinalCta({ handleStartTransaction }) {
  return (
    <section className="relative px-4 pb-20 pt-8">
      <div className="mx-auto max-w-7xl overflow-hidden border border-white/10 bg-gradient-to-br from-sky-400/16 via-[#07111f] to-emerald-400/16 p-7 shadow-[0_35px_120px_rgba(2,6,23,0.62)] sm:p-10">
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p style={{ color: BLUE, fontFamily: "'JetBrains Mono', monospace" }} className="text-xs font-bold">// START PROTECTED</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
              Build the deal around payment protection from the first click.
            </h2>
            <p style={{ color: MUTED }} className="mt-4 max-w-2xl text-lg leading-8">
              Create a secure transaction and give both sides a cleaner way to trade. Once funds are released, payouts are processed as quickly as possible and may take up to 2 business days.
            </p>
          </div>
          <button
            onClick={() => handleStartTransaction('landing_final_cta')}
            className="inline-flex min-h-[3.35rem] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-300 to-emerald-300 px-8 text-base font-bold text-slate-950 shadow-[0_24px_70px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_95px_rgba(56,189,248,0.36)] focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
            data-testid="cta-start-btn"
          >
            Start Secure Transaction <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer({ scrollToHowItWorks }) {
  return (
    <footer style={{ borderTop: `1px solid ${LINE}`, background: DARK_BG }} className="relative z-10 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 grid gap-8 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="mb-4">
              <TrustTradeLogo size="small" showText dark />
            </div>
            <p style={{ color: MUTED }} className="max-w-xs text-sm leading-relaxed">
              Secure payment protection for online transactions in South Africa. Buy and sell with total peace of mind.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={scrollToHowItWorks} style={{ color: MUTED }} className="transition-colors hover:text-white">
                  How It Works
                </button>
              </li>
              <li><a href="/escrow" style={{ color: MUTED }} className="transition-colors hover:text-white">Payment Protection</a></li>
              <li><a href="/disputes" style={{ color: MUTED }} className="transition-colors hover:text-white">Dispute Resolution</a></li>
              <li><a href="/about" style={{ color: MUTED }} className="transition-colors hover:text-white">About Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/terms" style={{ color: MUTED }} className="transition-colors hover:text-white">Terms of Service</a></li>
              <li><a href="/privacy" style={{ color: MUTED }} className="transition-colors hover:text-white">Privacy Policy</a></li>
              <li><a href="/refund" style={{ color: MUTED }} className="transition-colors hover:text-white">Refund Policy</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Contact</h4>
            <a href="mailto:trusttrade.register@gmail.com" style={{ color: MUTED }} className="mb-4 block text-sm transition-colors hover:text-white">
              trusttrade.register@gmail.com
            </a>
            <div className="flex items-center gap-4">
              <a
                href="https://www.facebook.com/profile.php?id=61586387282975"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: BLUE }}
                className="flex items-center"
                aria-label="TrustTrade on Facebook"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/trusttradesa"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: BLUE }}
                className="flex items-center"
                aria-label="TrustTrade on Instagram"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${LINE}` }} className="pt-8 text-center">
          <p style={{ color: MUTED }} className="text-sm">Copyright 2026 TrustTrade South Africa. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default LandingPage;
