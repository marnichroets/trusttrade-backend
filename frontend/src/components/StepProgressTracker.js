// Step Progress Tracker for Transaction Detail Page
import { CheckCircle, Clock } from 'lucide-react';
import { getTransactionFlowType, resolveEscrowUiState } from './transactionState';

const DELIVERY_STEPS = [
  { key: 'CREATED', label: 'Awaiting agreement', short: 'Agreement' },
  { key: 'CONFIRMED', label: 'Awaiting payment', short: 'Payment' },
  { key: 'PAID', label: 'Payment secured', short: 'Secured' },
  { key: 'SECURED', label: 'Delivery in progress', short: 'Delivery' },
  { key: 'DELIVERED', label: 'Awaiting buyer confirmation', short: 'Confirm' },
  { key: 'RELEASED', label: 'Funds released', short: 'Released' },
];

const INSTANT_STEPS = [
  { key: 'CREATED', label: 'Awaiting agreement', short: 'Agreement' },
  { key: 'CONFIRMED', label: 'Awaiting payment', short: 'Payment' },
  { key: 'PAID', label: 'Payment secured', short: 'Secured' },
  { key: 'PROCESSING', label: 'Release processing', short: 'Release' },
  { key: 'RELEASED', label: 'Funds released', short: 'Released' },
];

const NEUTRAL_STEPS = [
  { key: 'CREATED', label: 'Awaiting agreement', short: 'Agreement' },
  { key: 'CONFIRMED', label: 'Awaiting payment', short: 'Payment' },
  { key: 'PAID', label: 'Payment secured', short: 'Secured' },
  { key: 'CONDITIONS', label: 'Release conditions', short: 'Conditions' },
  { key: 'RELEASED', label: 'Funds released', short: 'Released' },
];

function getSteps(transaction) {
  const flowType = getTransactionFlowType(transaction);
  if (flowType === 'delivery') return DELIVERY_STEPS;
  if (flowType === 'instant') return INSTANT_STEPS;
  return NEUTRAL_STEPS;
}

function getStepIndex(transaction, uiState, steps) {
  const ps = (transaction.payment_status || '').toLowerCase();
  const ts = (transaction.tradesafe_state || '').toUpperCase();
  const bothConfirmed = transaction.buyer_confirmed && transaction.seller_confirmed;

  if (uiState.state === 'EXPIRED' || ps.includes('expired') || ts === 'EXPIRED') {
    return steps.length - 1;
  }
  if (uiState.terminal || uiState.state === 'RELEASED' || ts === 'FUNDS_RELEASED' || ps.includes('released') || ps.includes('completed')) {
    return steps.length - 1;
  }
  if (uiState.state === 'DELIVERY_PENDING' || uiState.state === 'DELIVERED' || ts === 'INITIATED' || ts === 'SENT' || ts === 'DELIVERED') {
    return Math.min(3, steps.length - 2);
  }
  if (uiState.state === 'ESCROW_LOCKED' || ts === 'FUNDS_RECEIVED' || ps.includes('secured') || ps.includes('escrow') || (ps === 'paid' && ts !== 'CREATED')) {
    return 2;
  }
  if (uiState.state === 'FUNDED' || ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING' || ps.includes('ready')) {
    return 1;
  }
  if (bothConfirmed) return 1;
  return 0;
}

export function StepProgressTracker({ transaction }) {
  const uiState = resolveEscrowUiState(transaction);
  const steps = getSteps(transaction);
  const currentStep = getStepIndex(transaction, uiState, steps);

  if (uiState.state === 'EXPIRED') {
    return (
      <div className="w-full min-w-0">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-500">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700">Transaction expired</p>
            <p className="text-xs text-slate-500">Transaction expired due to no payment</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* Desktop: Horizontal */}
      <div className="hidden sm:flex items-center justify-between relative min-w-0">
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200" />
        <div
          className="absolute top-4 left-0 h-0.5 bg-emerald-500 transition-all duration-500"
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, idx) => {
          const isFinalStep = idx === steps.length - 1;
          const isComplete = idx < currentStep || (isFinalStep && currentStep === idx && uiState.terminal);
          const isCurrent = idx === currentStep && !isComplete;

          return (
            <div key={step.key} className="relative flex flex-col items-center z-10 min-w-0">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                ${isComplete ? 'bg-emerald-500 text-white' :
                  isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                  'bg-white border-2 border-slate-200 text-slate-400'}
              `}>
                {isComplete ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span className="text-xs font-semibold">{idx + 1}</span>
                )}
              </div>
              <span className={`
                mt-2 text-xs font-medium text-center max-w-[104px] leading-tight
                ${isCurrent ? 'text-blue-600' : isComplete ? 'text-emerald-600' : 'text-slate-400'}
              `}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: Compact */}
      <div className="sm:hidden min-w-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs text-slate-500 shrink-0">Step {currentStep + 1} of {steps.length}</span>
          <span className="text-xs font-medium text-blue-600 text-right min-w-0 break-words">{steps[currentStep]?.label}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default StepProgressTracker;
