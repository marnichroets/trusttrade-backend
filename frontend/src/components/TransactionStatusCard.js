import { Shield, CheckCircle2, Truck, Clock, AlertTriangle, XCircle, CreditCard, Banknote, Lock, ArrowRight } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { getFlowCopy, getPendingPaymentExpiry, getTransactionFlowType, resolveEscrowUiState } from './transactionState';
import { getPayoutScheduleMessage } from '../utils/payoutSchedule';
import { usePlatformConfig } from '../context/PlatformConfigContext';

// Main transaction status card - shows current state prominently with clear next action
export function TransactionStatusCard({ transaction, userRole }) {
  const { config: platformConfig } = usePlatformConfig();
  const payoutSchedule = getPayoutScheduleMessage(new Date(), platformConfig);
  const uiState = resolveEscrowUiState(transaction, [], new Date(), payoutSchedule);
  const expiry = getPendingPaymentExpiry(transaction);
  const state = mapUiStateToStatusCardState(uiState) || transaction.transaction_state ||
    mapLegacyStatus(transaction.payment_status, transaction.tradesafe_state);
  
  const statusConfig = getStatusConfig(state, userRole, transaction, payoutSchedule);
  if (uiState.state === 'FUNDED' && expiry.isAwaitingPayment) {
    statusConfig.badge = expiry.expiresInLabel || statusConfig.badge;
    statusConfig.description = userRole === 'buyer'
      ? `Escrow is ready. Complete payment to secure your purchase. ${expiry.expiresInLabel}.`
      : `Waiting for the buyer to complete payment. ${expiry.expiresInLabel}.`;
  }
  if (uiState.state === 'EXPIRED' || expiry.isExpired) {
    const expiredConfig = getStatusConfig('EXPIRED', userRole, transaction, payoutSchedule);
    expiredConfig.description = 'Transaction expired due to no payment.';
    expiredConfig.badge = 'Expired';
    expiredConfig.nextAction = 'Review it in transaction history';
    const Icon = expiredConfig.icon;
    return (
      <Card className={`p-5 border-2 ${expiredConfig.borderClass}`} style={{ backgroundColor: expiredConfig.bgColor }}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${expiredConfig.iconBgClass}`}>
            <Icon className={`w-6 h-6 ${expiredConfig.iconClass}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className={`text-lg font-bold ${expiredConfig.titleClass}`}>
                {expiredConfig.title}
              </h3>
              <Badge className={expiredConfig.badgeClass}>
                {expiredConfig.badge}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              {expiredConfig.description}
            </p>
            {expiredConfig.nextAction && (
              <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-800">{expiredConfig.nextAction}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }
  const Icon = statusConfig.icon;
  
  return (
    <Card className={`p-5 border-2 ${statusConfig.borderClass}`} style={{ backgroundColor: statusConfig.bgColor }}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${statusConfig.iconBgClass}`}>
          <Icon className={`w-6 h-6 ${statusConfig.iconClass}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className={`text-lg font-bold ${statusConfig.titleClass}`}>
              {statusConfig.title}
            </h3>
            <Badge className={statusConfig.badgeClass}>
              {statusConfig.badge}
            </Badge>
          </div>
          <p className="text-sm text-slate-600 mb-3">
            {statusConfig.description}
          </p>
          
          {/* Next Action - Most Important */}
          {statusConfig.nextAction && (
            <div className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="text-sm font-medium text-slate-800">{statusConfig.nextAction}</span>
            </div>
          )}
          
          {/* Escrow Protection Notice */}
          {statusConfig.escrowNotice && (
            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{statusConfig.escrowNotice}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function mapUiStateToStatusCardState(uiState) {
  switch (uiState?.state) {
    case 'COMPLETED':
    case 'RELEASED':
      return 'COMPLETED';
    case 'DISPUTED':
      return 'DISPUTED';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'DELIVERY_PENDING':
      return 'DELIVERY_IN_PROGRESS';
    case 'ESCROW_LOCKED':
      return 'PAYMENT_SECURED';
    case 'FUNDED':
      return 'AWAITING_PAYMENT';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'CREATED':
    default:
      return 'PENDING_CONFIRMATION';
  }
}

function mapLegacyStatus(paymentStatus, tradesafeState) {
  const ps = (paymentStatus || '').toLowerCase();
  const ts = (tradesafeState || '').toUpperCase();
  
  if (ps.includes('expired') || ts === 'EXPIRED') return 'EXPIRED';
  if (ts === 'FUNDS_RELEASED' || ps.includes('completed') || ps.includes('released')) return 'COMPLETED';
  if (ts === 'DELIVERED' || ps.includes('delivered')) return 'DELIVERED';
  if (ts === 'INITIATED' || ts === 'SENT' || ps.includes('delivery') || ps.includes('dispatched')) return 'DELIVERY_IN_PROGRESS';
  if (ts === 'FUNDS_RECEIVED' || ps.includes('escrow') || ps.includes('secured') || ps === 'paid') return 'PAYMENT_SECURED';
  if (ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING') return 'AWAITING_PAYMENT';
  if (ps.includes('ready')) return 'READY_FOR_PAYMENT';
  if (ps.includes('pending') || ps.includes('confirmation')) return 'PENDING_CONFIRMATION';
  if (ps.includes('dispute')) return 'DISPUTED';
  if (ps.includes('cancel')) return 'CANCELLED';
  if (ps.includes('refund')) return 'REFUNDED';
  
  return 'CREATED';
}

function getStatusConfig(state, userRole, transaction, payoutSchedule = {}) {
  const isBuyer = userRole === 'buyer';
  const isSeller = userRole === 'seller';
  const flowType = getTransactionFlowType(transaction);
  const flow = getFlowCopy(transaction);
  const isDelivery = flowType === 'delivery';
  const isInstant = flowType === 'instant';
  
  const configs = {
    CREATED: {
      icon: Clock,
      title: 'Awaiting agreement',
      badge: 'Awaiting agreement',
      description: 'Waiting for both parties to review and confirm the transaction details.',
      nextAction: isSeller ? 'Confirm the transaction details to proceed' : 'Waiting for seller to confirm',
      bgColor: '#E6EDF3',
      borderClass: 'border-slate-200',
      iconBgClass: 'bg-slate-100',
      iconClass: 'text-slate-500',
      titleClass: 'text-slate-800',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200 pointer-events-none cursor-default'
    },
    PENDING_CONFIRMATION: {
      icon: Clock,
      title: 'Awaiting agreement',
      badge: 'Action Needed',
      description: 'Both buyer and seller must confirm the transaction details before payment.',
      nextAction: isSeller 
        ? 'Review and confirm the fee agreement below'
        : isBuyer 
        ? 'Review and confirm the transaction details below' 
        : 'Waiting for confirmations',
      bgColor: '#fef9c3',
      borderClass: 'border-amber-300',
      iconBgClass: 'bg-amber-100',
      iconClass: 'text-amber-600',
      titleClass: 'text-amber-800',
      badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200'
    },
    READY_FOR_PAYMENT: {
      icon: CreditCard,
      title: 'Ready for Payment',
      badge: 'Escrow Required',
      description: isSeller
        ? 'Both parties confirmed. Waiting for the buyer to fund escrow.'
        : 'Both parties confirmed. You can now fund escrow securely.',
      nextAction: isSeller
        ? 'Share the transaction link with the buyer'
        : 'Pay into escrow securely',
      escrowNotice: 'Once escrow is created, buyer can pay via EFT, Card, or Instant EFT.',
      bgColor: '#dbeafe',
      borderClass: 'border-blue-300',
      iconBgClass: 'bg-blue-100',
      iconClass: 'text-blue-600',
      titleClass: 'text-blue-800',
      badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200'
    },
    AWAITING_PAYMENT: {
      icon: CreditCard,
      title: 'Awaiting payment',
      badge: 'Pay Now',
      description: isBuyer 
        ? 'Escrow is ready. Complete payment to secure your purchase.' 
        : 'Waiting for the buyer to complete payment.',
      nextAction: isBuyer 
        ? 'Select a payment method and pay securely'
        : 'Buyer is completing payment',
      escrowNotice: isDelivery
        ? 'Funds will be held securely until buyer confirms delivery.'
        : 'Funds will be held securely until release conditions are met.',
      bgColor: '#dbeafe',
      borderClass: 'border-blue-300',
      iconBgClass: 'bg-blue-100',
      iconClass: 'text-blue-600',
      titleClass: 'text-blue-800',
      badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200'
    },
    EXPIRED: {
      icon: Clock,
      title: 'Transaction expired',
      badge: 'Expired',
      description: 'Transaction expired due to no payment.',
      nextAction: 'Review it in transaction history',
      escrowNotice: 'Expired transactions remain in your history for review.',
      bgColor: '#E6EDF3',
      borderClass: 'border-slate-300',
      iconBgClass: 'bg-slate-100',
      iconClass: 'text-slate-500',
      titleClass: 'text-slate-700',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200'
    },
    PAYMENT_SECURED: {
      icon: Shield,
      title: 'Funds secured in escrow',
      badge: 'Protected',
      description: isBuyer ? flow.securedBuyer : flow.securedSeller,
      nextAction: isSeller
        ? (isDelivery ? 'Dispatch the item and mark it in TrustTrade' : flow.sellerAction)
        : (isDelivery ? 'Waiting for seller to dispatch' : isInstant ? 'Release flow is processing' : 'Waiting for completion update'),
      escrowNotice: 'Funds release from escrow only when release conditions are met.',
      bgColor: '#d1fae5',
      borderClass: 'border-emerald-300',
      iconBgClass: 'bg-emerald-100',
      iconClass: 'text-emerald-600',
      titleClass: 'text-emerald-800',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    },
    DELIVERY_IN_PROGRESS: {
      icon: isDelivery ? Truck : Shield,
      title: flow.progressLabel,
      badge: isDelivery ? 'Dispatched' : isInstant ? 'Processing' : 'In progress',
      description: isDelivery
        ? (isBuyer ? 'Item has been dispatched. Confirm receipt once delivered.' : 'Delivery marked as dispatched. Waiting for buyer confirmation.')
        : flow.progressDescription,
      nextAction: isBuyer
        ? (isDelivery ? 'Confirm receipt once you receive the item' : flow.confirmAction)
        : (isDelivery ? 'Waiting for buyer confirmation' : 'No dispatch action required'),
      escrowNotice: 'Funds remain protected until release conditions are met.',
      bgColor: '#e0e7ff',
      borderClass: 'border-indigo-300',
      iconBgClass: 'bg-indigo-100',
      iconClass: 'text-indigo-600',
      titleClass: 'text-indigo-800',
      badgeClass: 'bg-indigo-100 text-indigo-700 border border-indigo-200'
    },
    DELIVERED: {
      icon: CheckCircle2,
      title: flow.confirmationLabel,
      badge: isDelivery ? 'Awaiting confirmation' : 'Release check',
      description: flow.confirmationDescription,
      nextAction: isBuyer ? flow.confirmAction : (isDelivery ? 'Waiting for buyer confirmation' : 'Waiting for release'),
      escrowNotice: 'Disputes pause payout before release.',
      bgColor: '#d1fae5',
      borderClass: 'border-emerald-300',
      iconBgClass: 'bg-emerald-100',
      iconClass: 'text-emerald-600',
      titleClass: 'text-emerald-800',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    },
    COMPLETED: {
      icon: Banknote,
      title: 'Completed',
      badge: payoutSchedule.shortCopy || 'Expected release',
      description: isSeller
        ? 'Your payout is now moving through the banking system. Funds have been released from escrow and are waiting on bank clearing.'
        : payoutSchedule.copy || 'Bank clearing may take up to 2 business days.',
      escrowNotice: payoutSchedule.disclaimer || 'Bank clearing may take up to 2 business days depending on payment runs, weekends, and bank processing.',
      bgColor: '#d1fae5',
      borderClass: 'border-green-300',
      iconBgClass: 'bg-green-100',
      iconClass: 'text-green-600',
      titleClass: 'text-green-800',
      badgeClass: 'bg-green-100 text-green-700 border border-green-200'
    },
    DISPUTED: {
      icon: AlertTriangle,
      title: 'Disputed / protection hold',
      badge: 'Under Review',
      description: 'Disputes pause payout before release while TrustTrade reviews the case.',
      nextAction: 'Our team will contact both parties within 24 hours',
      escrowNotice: 'Funds remain protected while we investigate.',
      bgColor: '#fef3c7',
      borderClass: 'border-amber-400',
      iconBgClass: 'bg-amber-100',
      iconClass: 'text-amber-600',
      titleClass: 'text-amber-800',
      badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200'
    },
    CANCELLED: {
      icon: XCircle,
      title: 'Transaction Cancelled',
      badge: 'Cancelled',
      description: 'This transaction has been cancelled.',
      bgColor: '#f1f5f9',
      borderClass: 'border-slate-300',
      iconBgClass: 'bg-slate-100',
      iconClass: 'text-slate-500',
      titleClass: 'text-slate-600',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200'
    },
    REFUNDED: {
      icon: Banknote,
      title: 'Funds Refunded',
      badge: 'Refunded',
      description: isBuyer 
        ? 'Your funds have been refunded.'
        : 'Funds have been returned to the buyer.',
      escrowNotice: 'Refund processed. Bank clearing may take up to 2 business days.',
      bgColor: '#fef2f2',
      borderClass: 'border-red-200',
      iconBgClass: 'bg-red-100',
      iconClass: 'text-red-600',
      titleClass: 'text-red-700',
      badgeClass: 'bg-red-100 text-red-700 border border-red-200'
    }
  };
  
  return configs[state] || configs.CREATED;
}

export default TransactionStatusCard;
