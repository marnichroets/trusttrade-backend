// Step Progress Tracker for Transaction Detail Page
import { CheckCircle, Circle } from 'lucide-react';

const STEPS = [
  { key: 'CREATED', label: 'Created', short: 'Created' },
  { key: 'CONFIRMED', label: 'Confirmed', short: 'Confirmed' },
  { key: 'PAID', label: 'Paid', short: 'Paid' },
  { key: 'SECURED', label: 'Secured', short: 'Secured' },
  { key: 'DELIVERED', label: 'Delivered', short: 'Delivered' },
  { key: 'RELEASED', label: 'Released', short: 'Released' }
];

// Map transaction states to step index
function getStepIndex(paymentStatus, tradesafeState, buyerConfirmed, sellerConfirmed) {
  const ps = (paymentStatus || '').toLowerCase();
  const ts = (tradesafeState || '').toUpperCase();
  const bothConfirmed = buyerConfirmed && sellerConfirmed;
  
  // Released / Completed
  if (ts === 'FUNDS_RELEASED' || ps.includes('released') || ps.includes('completed')) return 5;
  
  // Delivered - awaiting confirmation or funds release
  if (ts === 'DELIVERED' || ts === 'INITIATED' || ts === 'SENT' || 
      ps.includes('delivery') || ps.includes('dispatched')) return 4;
  
  // Funds secured in escrow
  if (ts === 'FUNDS_RECEIVED' || ps.includes('secured') || ps.includes('escrow') || 
      (ps === 'paid' && ts !== 'CREATED')) return 3;
  
  // Paid / Awaiting payment (escrow exists)
  if (ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING' || 
      ps.includes('ready')) return 2;
  
  // Both parties confirmed
  if (bothConfirmed) return 1;
  
  // Initial / Created
  return 0;
}

export function StepProgressTracker({ transaction }) {
  const currentStep = getStepIndex(
    transaction.payment_status,
    transaction.tradesafe_state,
    transaction.buyer_confirmed,
    transaction.seller_confirmed
  );

  return (
    <div className="w-full">
      {/* Desktop: Horizontal */}
      <div className="hidden sm:flex items-center justify-between relative">
        {/* Progress line background */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200" />
        {/* Progress line filled */}
        <div 
          className="absolute top-4 left-0 h-0.5 bg-emerald-500 transition-all duration-500"
          style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
        />
        
        {STEPS.map((step, idx) => {
          const isComplete = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isPending = idx > currentStep;
          
          return (
            <div key={step.key} className="relative flex flex-col items-center z-10">
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
                mt-2 text-xs font-medium whitespace-nowrap
                ${isCurrent ? 'text-blue-600' : isComplete ? 'text-emerald-600' : 'text-slate-400'}
              `}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: Compact */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Step {currentStep + 1} of {STEPS.length}</span>
          <span className="text-xs font-medium text-blue-600">{STEPS[currentStep]?.label}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default StepProgressTracker;
