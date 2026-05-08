import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, CreditCard, PackageCheck, ShieldCheck, Truck } from 'lucide-react';

const steps = [
  {
    title: 'Transaction Created',
    description: 'Both parties agree to the item, price, and escrow terms before payment starts.',
    icon: ShieldCheck,
    accent: 'from-blue-500 to-cyan-400',
  },
  {
    title: 'Buyer Pays Securely',
    description: 'Payment is held in protected escrow while TrustTrade tracks the transaction.',
    icon: CreditCard,
    accent: 'from-blue-600 to-indigo-400',
  },
  {
    title: 'Seller Delivers',
    description: 'The seller sends the item knowing the buyer funds are already secured.',
    icon: Truck,
    accent: 'from-emerald-500 to-teal-400',
  },
  {
    title: 'Funds Released',
    description: 'After delivery confirmation, funds move from escrow to the seller payout flow.',
    icon: PackageCheck,
    accent: 'from-green-500 to-emerald-400',
  },
];

export default function PremiumEscrowFlow({
  activeStep,
  autoPlay = true,
  intervalMs = 1800,
  className = '',
}) {
  const prefersReducedMotion = useReducedMotion();
  const [animatedStep, setAnimatedStep] = useState(0);

  const currentStep = typeof activeStep === 'number'
    ? Math.min(Math.max(activeStep, 0), steps.length - 1)
    : animatedStep;

  useEffect(() => {
    if (!autoPlay || prefersReducedMotion || typeof activeStep === 'number') return undefined;

    const timer = window.setInterval(() => {
      setAnimatedStep((step) => (step + 1) % steps.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [activeStep, autoPlay, intervalMs, prefersReducedMotion]);

  const progressWidth = useMemo(() => {
    if (steps.length <= 1) return '0%';
    return `${(currentStep / (steps.length - 1)) * 100}%`;
  }, [currentStep]);

  const containerAnimation = prefersReducedMotion
    ? {}
    : { opacity: [0, 1], y: [16, 0] };

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 px-4 py-6 text-white shadow-2xl sm:px-6 lg:px-8 ${className}`}
      aria-labelledby="premium-escrow-flow-title"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.32),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.22),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={containerAnimation}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative"
      >
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-100">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Escrow-protected payment flow
            </div>
            <h2 id="premium-escrow-flow-title" className="text-2xl font-bold tracking-normal text-white sm:text-3xl">
              Secure trade progression from agreement to payout
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              A clear four-step escrow journey designed for high-trust peer-to-peer transactions.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wider text-slate-400">Current stage</p>
            <p className="mt-1 text-sm font-semibold text-white">{steps[currentStep].title}</p>
          </div>
        </div>

        <div className="relative mb-6 hidden md:block" aria-hidden="true">
          <div className="h-1 rounded-full bg-white/10" />
          <motion.div
            className="absolute left-0 top-0 h-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400"
            initial={false}
            animate={{ width: progressWidth }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
          />
        </div>

        <ol className="grid gap-4 md:grid-cols-4" aria-label="TrustTrade escrow flow steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <motion.li
                key={step.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'relative rounded-xl border p-4 backdrop-blur-md transition-colors duration-300',
                  isActive
                    ? 'border-blue-300/50 bg-white/[0.14] shadow-lg shadow-blue-950/30'
                    : 'border-white/10 bg-white/[0.07]',
                ].join(' ')}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${step.accent} shadow-lg shadow-slate-950/30`}>
                    <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <div className={[
                    'flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-semibold',
                    isComplete
                      ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                      : isActive
                        ? 'border-blue-300/40 bg-blue-400/15 text-blue-100'
                        : 'border-white/10 bg-white/5 text-slate-400',
                  ].join(' ')}
                  >
                    {isComplete ? <CheckCircle2 className="h-4 w-4" aria-label="Completed" /> : `0${index + 1}`}
                  </div>
                </div>

                <h3 className="text-base font-semibold tracking-normal text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>

                <motion.div
                  className="mt-4 h-1 rounded-full bg-white/10 md:hidden"
                  aria-hidden="true"
                >
                  <motion.div
                    className={`h-1 rounded-full bg-gradient-to-r ${step.accent}`}
                    initial={false}
                    animate={{ width: isComplete || isActive ? '100%' : '0%' }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
                  />
                </motion.div>
              </motion.li>
            );
          })}
        </ol>
      </motion.div>
    </section>
  );
}
