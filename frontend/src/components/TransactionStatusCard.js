import { Shield, CheckCircle2, Truck, Clock, AlertTriangle, XCircle, CreditCard, DollarSign } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

const COLORS = {
  primary: '#1a2942',
  green: '#2ecc71',
  warning: '#f39c12',
  error: '#e74c3c',
  info: '#3498db',
  subtext: '#6c757d',
  section: '#f8f9fa'
};

// Main transaction status card - shows current state prominently
export function TransactionStatusCard({ transaction, userRole }) {
  const state = transaction.transaction_state || 
                mapLegacyStatus(transaction.payment_status, transaction.tradesafe_state);
  
  const statusConfig = getStatusConfig(state, userRole, transaction);
  const Icon = statusConfig.icon;
  
  return (
    <Card 
      className="p-6 border-2"
      style={{ 
        backgroundColor: statusConfig.bgColor,
        borderColor: statusConfig.borderColor
      }}
    >
      <div className="flex items-start gap-4">
        <div 
          className="p-3 rounded-full"
          style={{ backgroundColor: statusConfig.iconBg }}
        >
          <Icon className="w-8 h-8" style={{ color: statusConfig.iconColor }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 
              className="text-xl font-bold"
              style={{ color: statusConfig.textColor }}
            >
              {statusConfig.title}
            </h3>
            <Badge style={{ backgroundColor: statusConfig.badgeColor, color: 'white' }}>
              {statusConfig.badge}
            </Badge>
          </div>
          <p className="text-sm" style={{ color: statusConfig.descColor }}>
            {statusConfig.description}
          </p>
          {statusConfig.subtext && (
            <p className="text-xs mt-3 p-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.5)', color: COLORS.subtext }}>
              {statusConfig.subtext}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function mapLegacyStatus(paymentStatus, tradesafeState) {
  // Map old statuses to new state machine
  const ps = (paymentStatus || '').toLowerCase();
  const ts = (tradesafeState || '').toUpperCase();
  
  if (ts === 'FUNDS_RELEASED' || ps.includes('completed')) return 'COMPLETED';
  if (ts === 'DELIVERED' || ps.includes('delivered')) return 'DELIVERED';
  if (ts === 'INITIATED' || ps.includes('delivery') || ps.includes('dispatched')) return 'DELIVERY_IN_PROGRESS';
  if (ts === 'FUNDS_RECEIVED' || ps.includes('escrow') || ps.includes('secured')) return 'PAYMENT_SECURED';
  if (ps.includes('awaiting') || ts === 'CREATED') return 'AWAITING_PAYMENT';
  if (ps.includes('pending')) return 'PENDING_CONFIRMATION';
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
      description: 'Waiting for both parties to confirm the transaction details.',
      bgColor: COLORS.section,
      borderColor: COLORS.subtext,
      iconBg: `${COLORS.subtext}20`,
      iconColor: COLORS.subtext,
      textColor: COLORS.primary,
      descColor: COLORS.subtext,
      badgeColor: COLORS.subtext
    },
    PENDING_CONFIRMATION: {
      icon: Clock,
      title: 'Awaiting Confirmation',
      badge: 'Pending',
      description: isSeller 
        ? 'Please review and confirm the transaction details.' 
        : 'Waiting for the seller to confirm.',
      bgColor: `${COLORS.warning}10`,
      borderColor: COLORS.warning,
      iconBg: `${COLORS.warning}20`,
      iconColor: COLORS.warning,
      textColor: COLORS.primary,
      descColor: COLORS.subtext,
      badgeColor: COLORS.warning
    },
    AWAITING_PAYMENT: {
      icon: CreditCard,
      title: 'Awaiting Payment',
      badge: 'Payment Required',
      description: isBuyer 
        ? 'Please complete payment to secure your purchase.' 
        : 'Waiting for the buyer to complete payment.',
      bgColor: `${COLORS.info}10`,
      borderColor: COLORS.info,
      iconBg: `${COLORS.info}20`,
      iconColor: COLORS.info,
      textColor: COLORS.primary,
      descColor: COLORS.subtext,
      badgeColor: COLORS.info
    },
    PAYMENT_SECURED: {
      icon: Shield,
      title: '✅ Payment Secured by TrustTrade',
      badge: 'Funds Protected',
      description: isBuyer 
        ? 'Your payment is now safely held in escrow. The seller has been notified and can proceed with delivery.'
        : 'Payment has been received and secured! Please deliver the item to the buyer.',
      subtext: 'For security and compliance purposes, our regulated payment partner may also send a confirmation notification. This is expected and confirms that your funds are safely held.',
      bgColor: `${COLORS.green}10`,
      borderColor: COLORS.green,
      iconBg: `${COLORS.green}20`,
      iconColor: COLORS.green,
      textColor: COLORS.green,
      descColor: COLORS.primary,
      badgeColor: COLORS.green
    },
    DELIVERY_IN_PROGRESS: {
      icon: Truck,
      title: '🚚 Delivery in Progress',
      badge: 'Item Dispatched',
      description: isBuyer 
        ? 'The seller has dispatched your item. Please confirm receipt once delivered.'
        : 'Item dispatched. Waiting for buyer to confirm receipt.',
      bgColor: `${COLORS.info}10`,
      borderColor: COLORS.info,
      iconBg: `${COLORS.info}20`,
      iconColor: COLORS.info,
      textColor: COLORS.primary,
      descColor: COLORS.subtext,
      badgeColor: COLORS.info
    },
    DELIVERED: {
      icon: CheckCircle2,
      title: '📦 Item Delivered',
      badge: 'Confirmed',
      description: 'Delivery confirmed. Funds will be released to the seller.',
      bgColor: `${COLORS.green}10`,
      borderColor: COLORS.green,
      iconBg: `${COLORS.green}20`,
      iconColor: COLORS.green,
      textColor: COLORS.primary,
      descColor: COLORS.subtext,
      badgeColor: COLORS.green
    },
    COMPLETED: {
      icon: DollarSign,
      title: '💰 Transaction Complete',
      badge: 'Funds Released',
      description: isSeller 
        ? 'Congratulations! Funds have been released to your account.'
        : 'Transaction complete. Thank you for using TrustTrade!',
      bgColor: `${COLORS.green}10`,
      borderColor: COLORS.green,
      iconBg: `${COLORS.green}20`,
      iconColor: COLORS.green,
      textColor: COLORS.green,
      descColor: COLORS.primary,
      badgeColor: COLORS.green
    },
    DISPUTED: {
      icon: AlertTriangle,
      title: '⚠️ Dispute Opened',
      badge: 'Under Review',
      description: 'This transaction is under review by TrustTrade. We will resolve this as quickly as possible.',
      bgColor: `${COLORS.warning}10`,
      borderColor: COLORS.warning,
      iconBg: `${COLORS.warning}20`,
      iconColor: COLORS.warning,
      textColor: COLORS.warning,
      descColor: COLORS.primary,
      badgeColor: COLORS.warning
    },
    CANCELLED: {
      icon: XCircle,
      title: 'Transaction Cancelled',
      badge: 'Cancelled',
      description: 'This transaction has been cancelled.',
      bgColor: `${COLORS.section}`,
      borderColor: COLORS.subtext,
      iconBg: `${COLORS.subtext}20`,
      iconColor: COLORS.subtext,
      textColor: COLORS.subtext,
      descColor: COLORS.subtext,
      badgeColor: COLORS.subtext
    },
    REFUNDED: {
      icon: DollarSign,
      title: 'Funds Refunded',
      badge: 'Refunded',
      description: isBuyer 
        ? 'Your funds have been refunded.'
        : 'Funds have been returned to the buyer.',
      bgColor: `${COLORS.error}10`,
      borderColor: COLORS.error,
      iconBg: `${COLORS.error}20`,
      iconColor: COLORS.error,
      textColor: COLORS.error,
      descColor: COLORS.primary,
      badgeColor: COLORS.error
    }
  };
  
  return configs[state] || configs.CREATED;
}

export default TransactionStatusCard;
