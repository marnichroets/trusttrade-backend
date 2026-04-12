import { Shield, CheckCircle2, Truck, Clock, AlertTriangle, XCircle, CreditCard, Banknote, Lock, ArrowRight } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

// Main transaction status card - shows current state prominently with clear next action
export function TransactionStatusCard({ transaction, userRole }) {
  const state = transaction.transaction_state || 
                mapLegacyStatus(transaction.payment_status, transaction.tradesafe_state);
  
  const statusConfig = getStatusConfig(state, userRole, transaction);
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

function mapLegacyStatus(paymentStatus, tradesafeState) {
  const ps = (paymentStatus || '').toLowerCase();
  const ts = (tradesafeState || '').toUpperCase();
  
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

function getStatusConfig(state, userRole, transaction) {
  const isBuyer = userRole === 'buyer';
  const isSeller = userRole === 'seller';
  
  const configs = {
    CREATED: {
      icon: Clock,
      title: 'Transaction Created',
      badge: 'Pending',
      description: 'Waiting for both parties to review and confirm the transaction details.',
      nextAction: isSeller ? 'Confirm the transaction details to proceed' : 'Waiting for seller to confirm',
      bgColor: '#f8fafc',
      borderClass: 'border-slate-200',
      iconBgClass: 'bg-slate-100',
      iconClass: 'text-slate-500',
      titleClass: 'text-slate-800',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200'
    },
    PENDING_CONFIRMATION: {
      icon: Clock,
      title: 'Awaiting Confirmation',
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
        ? 'Both parties confirmed. Create the escrow to enable buyer payment.'
        : 'Waiting for seller to set up secure escrow payment.',
      nextAction: isSeller 
        ? 'Click "Create Escrow" to enable payment'
        : 'Seller is setting up secure payment',
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
      title: 'Awaiting Payment',
      badge: 'Pay Now',
      description: isBuyer 
        ? 'Escrow is ready. Complete payment to secure your purchase.' 
        : 'Waiting for the buyer to complete payment.',
      nextAction: isBuyer 
        ? 'Select a payment method and pay securely'
        : 'Buyer is completing payment',
      escrowNotice: 'Funds will be held securely until you confirm delivery.',
      bgColor: '#dbeafe',
      borderClass: 'border-blue-300',
      iconBgClass: 'bg-blue-100',
      iconClass: 'text-blue-600',
      titleClass: 'text-blue-800',
      badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200'
    },
    PAYMENT_SECURED: {
      icon: Shield,
      title: 'Funds Secured in Escrow',
      badge: 'Protected',
      description: isBuyer 
        ? 'Your payment is safely held in escrow. Seller can now ship the item.'
        : 'Payment received! Ship the item and mark as delivered.',
      nextAction: isSeller 
        ? 'Ship the item and click "Start Delivery"'
        : 'Waiting for seller to ship',
      escrowNotice: 'Funds only released when buyer confirms receipt. Bank payout: 1-2 business days.',
      bgColor: '#d1fae5',
      borderClass: 'border-emerald-300',
      iconBgClass: 'bg-emerald-100',
      iconClass: 'text-emerald-600',
      titleClass: 'text-emerald-800',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    },
    DELIVERY_IN_PROGRESS: {
      icon: Truck,
      title: 'Delivery in Progress',
      badge: 'Shipped',
      description: isBuyer 
        ? 'Item has been shipped. Confirm receipt once delivered.'
        : 'Item shipped. Waiting for buyer to confirm receipt.',
      nextAction: isBuyer 
        ? 'Click "Confirm Receipt" once you receive the item'
        : 'Waiting for buyer confirmation',
      escrowNotice: 'Funds remain protected until buyer confirms delivery.',
      bgColor: '#e0e7ff',
      borderClass: 'border-indigo-300',
      iconBgClass: 'bg-indigo-100',
      iconClass: 'text-indigo-600',
      titleClass: 'text-indigo-800',
      badgeClass: 'bg-indigo-100 text-indigo-700 border border-indigo-200'
    },
    DELIVERED: {
      icon: CheckCircle2,
      title: 'Delivery Confirmed',
      badge: 'Complete',
      description: 'Buyer confirmed receipt. Funds are being released.',
      nextAction: isSeller ? 'Funds will arrive in 1-2 business days' : null,
      escrowNotice: 'Bank payouts processed at 10:00 and 15:00 daily.',
      bgColor: '#d1fae5',
      borderClass: 'border-emerald-300',
      iconBgClass: 'bg-emerald-100',
      iconClass: 'text-emerald-600',
      titleClass: 'text-emerald-800',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    },
    COMPLETED: {
      icon: Banknote,
      title: 'Transaction Complete',
      badge: 'Funds Released',
      description: isSeller 
        ? 'Funds have been released to your bank account.'
        : 'Transaction complete. Thank you for using TrustTrade!',
      escrowNotice: 'Thank you for trusting TrustTrade for your secure transaction.',
      bgColor: '#d1fae5',
      borderClass: 'border-green-300',
      iconBgClass: 'bg-green-100',
      iconClass: 'text-green-600',
      titleClass: 'text-green-800',
      badgeClass: 'bg-green-100 text-green-700 border border-green-200'
    },
    DISPUTED: {
      icon: AlertTriangle,
      title: 'Dispute Opened',
      badge: 'Under Review',
      description: 'This transaction is under review by TrustTrade support.',
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
      escrowNotice: 'Refund processed. Bank arrival: 1-2 business days.',
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
