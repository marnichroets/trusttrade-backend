import { CheckCircle2, Clock, CreditCard, Truck, Package, DollarSign, AlertTriangle, XCircle, Shield, FileText } from 'lucide-react';

const COLORS = {
  primary: '#1a2942',
  green: '#2ecc71',
  warning: '#f39c12',
  error: '#e74c3c',
  info: '#3498db',
  subtext: '#6c757d'
};

const TIMELINE_STEPS = [
  { 
    key: 'created', 
    label: 'Transaction Created', 
    icon: FileText,
    states: ['CREATED']
  },
  { 
    key: 'confirmed', 
    label: 'Confirmed by Both Parties', 
    icon: CheckCircle2,
    states: ['PENDING_CONFIRMATION', 'AWAITING_PAYMENT']
  },
  { 
    key: 'payment', 
    label: 'Payment Secured', 
    icon: Shield,
    states: ['PAYMENT_SECURED']
  },
  { 
    key: 'delivery', 
    label: 'Delivery in Progress', 
    icon: Truck,
    states: ['DELIVERY_IN_PROGRESS']
  },
  { 
    key: 'delivered', 
    label: 'Delivered', 
    icon: Package,
    states: ['DELIVERED']
  },
  { 
    key: 'completed', 
    label: 'Funds Released', 
    icon: DollarSign,
    states: ['COMPLETED']
  }
];

function getStepStatus(stepStates, currentState, allTimelineEvents) {
  // Check if any step state matches current state
  const isCurrentStep = stepStates.includes(currentState);
  
  // Check if step is completed (current state is beyond this step)
  const stateOrder = ['CREATED', 'PENDING_CONFIRMATION', 'AWAITING_PAYMENT', 'PAYMENT_SECURED', 'DELIVERY_IN_PROGRESS', 'DELIVERED', 'COMPLETED'];
  const currentIndex = stateOrder.indexOf(currentState);
  const stepHighestIndex = Math.max(...stepStates.map(s => stateOrder.indexOf(s)));
  
  const isCompleted = currentIndex > stepHighestIndex;
  
  return { isCurrentStep, isCompleted };
}

export function TransactionTimeline({ transaction, currentState, timeline = [] }) {
  // Handle disputed or cancelled states
  const isDisputed = currentState === 'DISPUTED';
  const isCancelled = currentState === 'CANCELLED';
  const isRefunded = currentState === 'REFUNDED';
  
  if (isDisputed || isCancelled || isRefunded) {
    return (
      <div className="space-y-4">
        {/* Show completed steps */}
        {TIMELINE_STEPS.map((step, index) => {
          const { isCompleted } = getStepStatus(step.states, currentState, timeline);
          const Icon = step.icon;
          
          // For disputed/cancelled, show what was completed before
          const wasCompleted = timeline?.some(t => 
            step.states.some(s => t.status?.toLowerCase().includes(s.toLowerCase()))
          );
          
          if (!wasCompleted && !isCompleted) return null;
          
          return (
            <div key={step.key} className="flex items-center gap-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.green}20` }}
              >
                <Icon className="w-5 h-5" style={{ color: COLORS.green }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: COLORS.primary }}>{step.label}</p>
              </div>
              <CheckCircle2 className="w-5 h-5" style={{ color: COLORS.green }} />
            </div>
          );
        })}
        
        {/* Show special state */}
        <div className="flex items-center gap-4 p-3 rounded-lg" style={{ backgroundColor: `${isDisputed ? COLORS.warning : COLORS.error}15` }}>
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${isDisputed ? COLORS.warning : COLORS.error}30` }}
          >
            {isDisputed ? (
              <AlertTriangle className="w-5 h-5" style={{ color: COLORS.warning }} />
            ) : (
              <XCircle className="w-5 h-5" style={{ color: COLORS.error }} />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm" style={{ color: isDisputed ? COLORS.warning : COLORS.error }}>
              {isDisputed ? 'Dispute Opened' : isCancelled ? 'Transaction Cancelled' : 'Funds Refunded'}
            </p>
            <p className="text-xs" style={{ color: COLORS.subtext }}>
              {isDisputed ? 'Transaction under review by TrustTrade' : 'This transaction has ended'}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      {TIMELINE_STEPS.map((step, index) => {
        const { isCurrentStep, isCompleted } = getStepStatus(step.states, currentState, timeline);
        const Icon = step.icon;
        const isLast = index === TIMELINE_STEPS.length - 1;
        
        let stepColor = COLORS.subtext;
        let bgColor = `${COLORS.subtext}15`;
        let lineColor = COLORS.subtext;
        
        if (isCompleted) {
          stepColor = COLORS.green;
          bgColor = `${COLORS.green}15`;
          lineColor = COLORS.green;
        } else if (isCurrentStep) {
          stepColor = COLORS.info;
          bgColor = `${COLORS.info}15`;
        }
        
        return (
          <div key={step.key} className="flex">
            {/* Icon and line */}
            <div className="flex flex-col items-center mr-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: bgColor }}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" style={{ color: stepColor }} />
                ) : (
                  <Icon className="w-5 h-5" style={{ color: stepColor }} />
                )}
              </div>
              {!isLast && (
                <div 
                  className="w-0.5 h-8 my-1"
                  style={{ backgroundColor: isCompleted ? COLORS.green : '#e5e7eb' }}
                />
              )}
            </div>
            
            {/* Content */}
            <div className="pb-6">
              <p 
                className="font-medium text-sm"
                style={{ color: isCompleted || isCurrentStep ? COLORS.primary : COLORS.subtext }}
              >
                {isCompleted ? '✔ ' : ''}{step.label}
              </p>
              {isCurrentStep && (
                <p className="text-xs mt-1" style={{ color: COLORS.info }}>
                  Current step
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Auto-release countdown component
export function AutoReleaseCountdown({ autoReleaseAt, hasDispute }) {
  if (hasDispute) {
    return (
      <div className="p-4 rounded-lg" style={{ backgroundColor: `${COLORS.warning}15` }}>
        <p className="text-sm font-medium" style={{ color: COLORS.warning }}>
          Auto-release paused due to active dispute
        </p>
      </div>
    );
  }
  
  if (!autoReleaseAt) return null;
  
  const releaseDate = new Date(autoReleaseAt);
  const now = new Date();
  const diffMs = releaseDate - now;
  
  if (diffMs <= 0) {
    return (
      <div className="p-4 rounded-lg" style={{ backgroundColor: `${COLORS.green}15` }}>
        <p className="text-sm font-medium" style={{ color: COLORS.green }}>
          Funds ready for release
        </p>
      </div>
    );
  }
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: `${COLORS.info}15` }}>
      <p className="text-xs font-medium mb-1" style={{ color: COLORS.subtext }}>
        Auto-release countdown
      </p>
      <p className="text-lg font-bold" style={{ color: COLORS.info }}>
        {hours > 24 
          ? `${Math.floor(hours / 24)} days ${hours % 24}h`
          : `${hours}h ${minutes}m`
        }
      </p>
      <p className="text-xs mt-1" style={{ color: COLORS.subtext }}>
        Funds will auto-release if no dispute is raised
      </p>
    </div>
  );
}

export default TransactionTimeline;
