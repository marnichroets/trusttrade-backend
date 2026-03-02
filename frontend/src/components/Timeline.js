import { CheckCircle, Circle, Clock } from 'lucide-react';

function Timeline({ transaction }) {
  const steps = [
    { label: 'Transaction Created', key: 'created' },
    { label: 'Seller Confirmed', key: 'seller_confirmed' },
    { label: 'Payment Received', key: 'payment_received' },
    { label: 'Item Shipped', key: 'item_shipped' },
    { label: 'Delivery Confirmed', key: 'delivery_confirmed' },
    { label: 'Funds Released', key: 'funds_released' }
  ];

  const getStepStatus = (key) => {
    switch(key) {
      case 'created':
        return 'complete';
      case 'seller_confirmed':
        return transaction.seller_confirmed ? 'complete' : 'pending';
      case 'payment_received':
        return transaction.payment_status === 'Ready for Payment' || transaction.payment_status === 'Released' ? 'complete' : 'pending';
      case 'item_shipped':
        return transaction.payment_status === 'Released' ? 'complete' : 'pending';
      case 'delivery_confirmed':
        return transaction.delivery_confirmed ? 'complete' : 'pending';
      case 'funds_released':
        return transaction.release_status === 'Released' ? 'complete' : 'pending';
      default:
        return 'pending';
    }
  };

  const getCurrentStep = () => {
    if (transaction.release_status === 'Released') return 5;
    if (transaction.delivery_confirmed) return 4;
    if (transaction.payment_status === 'Released') return 3;
    if (transaction.payment_status === 'Ready for Payment') return 2;
    if (transaction.seller_confirmed) return 1;
    return 0;
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
                <p className="text-sm text-slate-500 mt-1">In Progress</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Timeline;