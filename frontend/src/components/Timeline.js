import { CheckCircle, Circle, Clock } from 'lucide-react';
import { resolveEscrowUiState } from './transactionState';

function Timeline({ transaction }) {
  const steps = [
    { label: 'Awaiting agreement', key: 'created' },
    { label: 'Awaiting payment', key: 'payment_received' },
    { label: 'Funds secured in escrow', key: 'funds_secured' },
    { label: 'Delivery in progress', key: 'item_shipped' },
    { label: 'Awaiting buyer confirmation', key: 'delivery_confirmed' },
    { label: 'Funds released', key: 'funds_released' }
  ];
  const uiState = resolveEscrowUiState(transaction);

  const getStepStatus = (key) => {
    switch(key) {
      case 'created':
        return 'complete';
      case 'seller_confirmed':
        return transaction.seller_confirmed ? 'complete' : 'pending';
      case 'payment_received':
        return uiState.progressIndex >= 2 ? 'complete' : 'pending';
      case 'funds_secured':
        return uiState.progressIndex >= 3 ? 'complete' : 'pending';
      case 'item_shipped':
        return uiState.progressIndex >= 4 ? 'complete' : 'pending';
      case 'delivery_confirmed':
        return uiState.progressIndex >= 5 ? 'complete' : 'pending';
      case 'funds_released':
        return uiState.terminal ? 'complete' : 'pending';
      default:
        return 'pending';
    }
  };

  const getCurrentStep = () => {
    return Math.min(uiState.progressIndex, steps.length - 1);
  };

  const currentStep = getCurrentStep();

  return (
    <div className="space-y-4" data-testid="transaction-timeline">
      {steps.map((step, index) => {
        const status = getStepStatus(step.key);
        const isActive = index === currentStep;
        const isComplete = status === 'complete';

        return (
          <div key={step.key} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isComplete ? 'bg-green-100 text-green-600' :
                isActive ? 'bg-blue-100 text-primary' :
                'bg-slate-100 text-slate-400'
              }`}>
                {isComplete ? (
                  <CheckCircle className="w-6 h-6" />
                ) : isActive ? (
                  <Clock className="w-6 h-6" />
                ) : (
                  <Circle className="w-6 h-6" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-0.5 h-8 ${
                  isComplete ? 'bg-green-300' : 'bg-slate-200'
                }`}></div>
              )}
            </div>
            <div className="flex-1 pt-2">
              <p className={`font-medium ${
                isComplete ? 'text-green-600' :
                isActive ? 'text-primary' :
                'text-slate-400'
              }`}>{step.label}</p>
              {isActive && (
                <p className="text-sm text-slate-500 mt-1">{uiState.secondaryLabel || 'In progress'}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Timeline;
