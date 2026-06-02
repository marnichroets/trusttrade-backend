const COLORS = {
  accent: '#00D1FF',
  success: '#00FFA3',
  error: '#FF3B30',
  warn: '#F0B429',
  purple: '#A78BFA',
  sub: '#8B949E',
};

const UNPAID_EXPIRY_HOURS = 72;

export const PAYOUT_TIMING_COPY = 'Once funds are released from escrow, payouts are processed as quickly as possible. Bank settlement may take up to 2 business days depending on payment runs, weekends, and bank processing.';
export const PAYOUT_TIMING_SHORT = 'Payout processing · up to 2 business days';

export const ESCROW_FLOW_STEPS = [
  { key: 'CREATED', label: 'Awaiting agreement' },
  { key: 'FUNDED', label: 'Awaiting payment' },
  { key: 'ESCROW_LOCKED', label: 'Funds secured' },
  { key: 'DELIVERY_PENDING', label: 'Delivery in progress' },
  { key: 'DELIVERED', label: 'Awaiting buyer confirmation' },
  { key: 'RELEASED', label: 'Funds released' },
];

export function fieldText(...values) {
  return values.filter(Boolean).join(' ').toLowerCase();
}

export function parseTransactionDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatExpiryCountdown(msRemaining) {
  const hours = Math.max(0, msRemaining) / (1000 * 60 * 60);
  if (hours < 1) return 'less than 1 hour';
  if (hours < 24) return `${Math.ceil(hours)} hour${Math.ceil(hours) === 1 ? '' : 's'}`;
  const days = hours / 24;
  return `${Math.ceil(days)} day${Math.ceil(days) === 1 ? '' : 's'}`;
}

export function getPendingPaymentExpiry(transaction = {}, now = new Date()) {
  const referenceDate = parseTransactionDate(
    transaction.awaiting_payment_at ||
    transaction.payment_requested_at ||
    transaction.payment_due_at
  );

  if (!referenceDate) {
    return {
      isAwaitingPayment: false,
      isExpired: false,
      expiresAt: null,
      expiresInLabel: null,
      ageHours: null,
    };
  }

  const paymentStatus = fieldText(transaction.payment_status, transaction.transaction_status, transaction.transaction_state, transaction.tradesafe_state);
  const isPaymentPhase = (
    paymentStatus.includes('awaiting payment') ||
    paymentStatus.includes('ready for payment') ||
    paymentStatus.includes('pending payment') ||
    paymentStatus.includes('awaiting payment into escrow') ||
    paymentStatus.includes('payment pending') ||
    fieldText(transaction.transaction_state).includes('awaiting_payment')
  );

  const terminal = fieldText(transaction.payment_status, transaction.transaction_state, transaction.payout_status, transaction.tradesafe_state);
  if (!isPaymentPhase || terminal.includes('expired') || terminal.includes('completed') || terminal.includes('released') || terminal.includes('cancel') || terminal.includes('refund')) {
    return {
      isAwaitingPayment: false,
      isExpired: false,
      expiresAt: null,
      expiresInLabel: null,
      ageHours: null,
    };
  }

  const expiryAt = new Date(referenceDate.getTime() + UNPAID_EXPIRY_HOURS * 60 * 60 * 1000);
  const msRemaining = expiryAt.getTime() - now.getTime();
  const ageHours = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60);

  return {
    isAwaitingPayment: true,
    isExpired: msRemaining <= 0,
    expiresAt: expiryAt.toISOString(),
    expiresInLabel: msRemaining <= 0 ? 'Transaction expired due to no payment' : `Expires in ${formatExpiryCountdown(msRemaining)}`,
    ageHours,
  };
}

export function getTransactionFlowType(transaction = {}) {
  const method = fieldText(
    transaction.delivery_method,
    transaction.transaction_type,
    transaction.release_type,
    transaction.fulfillment_type
  );

  if (method.includes('courier') || method.includes('delivery') || method.includes('shipping') || method.includes('physical')) {
    return 'delivery';
  }
  if (method.includes('digital') || method.includes('instant') || method.includes('immediate')) {
    return 'instant';
  }
  return 'neutral';
}

export function getFlowCopy(transaction = {}) {
  const flowType = getTransactionFlowType(transaction);
  if (flowType === 'delivery') {
    return {
      flowType,
      securedLabel: 'Funds secured in escrow',
      securedBuyer: 'Your payment is safely held in escrow. Seller can now dispatch the item.',
      securedSeller: 'Payment is protected in escrow. Dispatch the item and update the transaction.',
      progressLabel: 'Delivery in progress',
      progressDescription: 'Delivery is in progress. Buyer confirmation controls escrow release.',
      confirmationLabel: 'Awaiting buyer confirmation',
      confirmationDescription: 'Delivery has been marked complete. Buyer confirmation is required before release.',
      confirmAction: 'Confirm receipt',
      sellerAction: 'Mark as dispatched',
    };
  }
  if (flowType === 'instant') {
    return {
      flowType,
      securedLabel: 'Funds secured in escrow',
      securedBuyer: 'Your payment is secured in escrow. The instant release flow will process according to the agreed terms.',
      securedSeller: 'Payment is protected in escrow. No delivery dispatch action is required for this instant flow.',
      progressLabel: 'Release approved',
      progressDescription: 'Release is being processed according to the instant escrow flow.',
      confirmationLabel: 'Transaction complete',
      confirmationDescription: 'All done! The funds are being released to the seller — the payout is on its way.',
      confirmAction: 'View release status',
      sellerAction: 'View transaction',
    };
  }
  return {
    flowType,
    securedLabel: 'Funds secured in escrow',
    securedBuyer: 'Your payment is safely held in escrow until the agreed release conditions are met.',
    securedSeller: 'Payment is protected in escrow. Complete the agreed conditions and update the transaction.',
    progressLabel: 'Release conditions in progress',
    progressDescription: 'The agreed release conditions are being completed.',
    confirmationLabel: 'Transaction complete',
    confirmationDescription: 'All done! The funds are being released to the seller — the payout is on its way.',
    confirmAction: 'Confirm completion',
    sellerAction: 'Update completion',
  };
}

export function hasOpenDispute(transaction, disputes = []) {
  const local = fieldText(transaction?.dispute_status, transaction?.dispute?.status);
  const localResolved = local.includes('resolved') || local.includes('closed') || local.includes('dismissed');
  if (!localResolved && local.includes('dispute')) return true;
  return disputes.some((dispute) => {
    const status = fieldText(dispute.status);
    const resolved = status.includes('resolved') || status.includes('closed') || status.includes('dismissed') || status.includes('cancelled') || status.includes('canceled');
    const open = !resolved && (!status || status.includes('pending') || status.includes('open') || status.includes('active') || status.includes('response') || status.includes('escalated') || status.includes('review'));
    return open && dispute.transaction_id && dispute.transaction_id === transaction?.transaction_id;
  });
}

export function resolveEscrowUiState(transaction = {}, disputes = []) {
  const flow = getFlowCopy(transaction);
  const payment = fieldText(transaction.payment_status);
  const release = fieldText(transaction.release_status);
  const transactionStatus = fieldText(transaction.transaction_status, transaction.transaction_state);
  const delivery = fieldText(transaction.delivery_status);
  const payout = fieldText(transaction.payout_status);
  const tradesafe = fieldText(transaction.tradesafe_state);
  const combined = fieldText(payment, release, transactionStatus, delivery, payout, tradesafe);
  const notReleased = release.includes('not released') || release.includes('unreleased');

  const buyerConfirmed = Boolean(transaction.buyer_confirmed);
  const sellerConfirmed = Boolean(transaction.seller_confirmed);
  const bothConfirmed = buyerConfirmed && sellerConfirmed;
  const deliveryConfirmed = Boolean(transaction.delivery_confirmed) ||
    delivery.includes('delivered') ||
    delivery.includes('confirmed') ||
    tradesafe.includes('delivered');
  const deliveryStarted = Boolean(transaction.delivery_started_at) ||
    delivery.includes('progress') ||
    delivery.includes('transit') ||
    delivery.includes('sent') ||
    tradesafe.includes('initiated') ||
    tradesafe.includes('sent') ||
    tradesafe.includes('delivered') ||
    payment.includes('delivery');
  const fundsSecured = payment.includes('paid') ||
    payment.includes('secured') ||
    payment.includes('funds received') ||
    payment.includes('completed') ||
    payment.includes('released') ||
    tradesafe.includes('funds_received') ||
    tradesafe.includes('funds_deposited') ||
    tradesafe.includes('funds_released') ||
    // Once a transaction has been dispatched or its receipt confirmed, the funds
    // are definitionally in escrow. Treat these as "secured" so a post-payment
    // transaction can never fall back to the "awaiting buyer payment" state.
    deliveryStarted ||
    deliveryConfirmed ||
    Boolean(transaction.auto_release_at) ||
    Boolean(transaction.buyer_confirmed_receipt_at);
  const released = (!notReleased && release.includes('released')) ||
    payment.includes('released') ||
    payout.includes('paid') ||
    payout.includes('released') ||
    tradesafe.includes('funds_released') ||
    // The buyer confirming receipt is our reliable signal that payout is in motion.
    Boolean(transaction.buyer_confirmed_receipt_at);
  const completed = transactionStatus.includes('completed') ||
    payment.includes('completed') ||
    (deliveryConfirmed && fundsSecured && released);

  if (combined.includes('cancel') || combined.includes('refund')) {
    return {
      state: combined.includes('refund') ? 'REFUNDED' : 'CANCELLED',
      label: combined.includes('refund') ? 'Refunded' : 'Cancelled',
      description: 'This escrow transaction is no longer active.',
      color: COLORS.error,
      bg: 'rgba(255,59,48,0.1)',
      progressIndex: 0,
      terminal: true,
      actionable: false,
    };
  }

  if (completed) {
    return {
      state: 'COMPLETED',
      label: 'Completed',
      description: `No further action required. ${PAYOUT_TIMING_COPY}`,
      secondaryLabel: PAYOUT_TIMING_SHORT,
      color: COLORS.success,
      bg: 'rgba(0,255,163,0.1)',
      progressIndex: ESCROW_FLOW_STEPS.length,
      terminal: true,
      actionable: false,
    };
  }

  if (released) {
    return {
      state: 'RELEASED',
      label: payout.includes('fail') ? 'Bank settlement pending' : 'Bank payout release scheduled',
      description: PAYOUT_TIMING_COPY,
      secondaryLabel: PAYOUT_TIMING_SHORT,
      color: COLORS.success,
      bg: 'rgba(0,255,163,0.1)',
      progressIndex: ESCROW_FLOW_STEPS.length,
      terminal: true,
      actionable: false,
    };
  }

  if (hasOpenDispute(transaction, disputes)) {
    return {
      state: 'DISPUTED',
      label: 'Disputed / protection hold',
      description: 'Disputes pause payout before release while TrustTrade reviews the case.',
      color: COLORS.error,
      bg: 'rgba(255,59,48,0.1)',
      progressIndex: 4,
      terminal: false,
      actionable: false,
    };
  }

  const explicitExpiry = getPendingPaymentExpiry(transaction);
  if (
    transaction.archived ||
    payment.includes('expired') ||
    transactionStatus.includes('expired') ||
    tradesafe.includes('expired') ||
    explicitExpiry.isExpired
  ) {
    return {
      state: 'EXPIRED',
      label: 'Transaction expired',
      description: 'Transaction expired due to no payment.',
      secondaryLabel: 'No payment received within 72 hours',
      color: '#64748b',
      bg: 'rgba(100,116,139,0.1)',
      progressIndex: 2,
      terminal: true,
      actionable: false,
      expiresAt: explicitExpiry.expiresAt,
    };
  }

  if (!bothConfirmed) {
    return {
      state: 'CREATED',
      label: 'Awaiting agreement',
      description: 'Both parties must confirm the transaction terms.',
      color: COLORS.warn,
      bg: 'rgba(240,180,41,0.1)',
      progressIndex: 1,
      terminal: false,
      actionable: true,
    };
  }

  const paymentExpiry = getPendingPaymentExpiry(transaction);
  const awaitingPayment = !fundsSecured && (
    payment.includes('awaiting') ||
    payment.includes('ready') ||
    payment.includes('pending') ||
    transactionStatus.includes('awaiting_payment') ||
    tradesafe.includes('created') ||
    tradesafe.includes('pending')
  );

  if (awaitingPayment) {
    if (paymentExpiry.isExpired) {
      return {
        state: 'EXPIRED',
        label: 'Transaction expired',
        description: 'Transaction expired due to no payment.',
        secondaryLabel: 'No payment received within 72 hours',
        color: '#64748b',
        bg: 'rgba(100,116,139,0.1)',
        progressIndex: 2,
        terminal: true,
        actionable: false,
        expiresAt: paymentExpiry.expiresAt,
      };
    }
    return {
      state: 'FUNDED',
      label: 'Awaiting payment',
      description: 'Waiting for buyer payment into escrow.',
      secondaryLabel: paymentExpiry.expiresInLabel,
      expiresAt: paymentExpiry.expiresAt,
      color: COLORS.accent,
      bg: 'rgba(0,209,255,0.1)',
      progressIndex: 2,
      terminal: false,
      actionable: true,
    };
  }

  if (fundsSecured && !deliveryStarted) {
    return {
      state: 'ESCROW_LOCKED',
      label: flow.securedLabel,
      description: flow.flowType === 'delivery'
        ? 'Funds are locked in escrow until delivery is confirmed.'
        : 'Funds are locked in escrow until release conditions are met.',
      color: COLORS.success,
      bg: 'rgba(0,255,163,0.1)',
      progressIndex: 3,
      terminal: false,
      actionable: true,
    };
  }

  if (deliveryStarted && !deliveryConfirmed) {
    return {
      state: 'DELIVERY_PENDING',
      label: flow.progressLabel,
      description: flow.progressDescription,
      color: COLORS.purple,
      bg: 'rgba(167,139,250,0.12)',
      progressIndex: 4,
      terminal: false,
      actionable: true,
    };
  }

  return {
    state: 'DELIVERED',
    label: flow.confirmationLabel,
    description: flow.confirmationDescription,
    color: COLORS.success,
    bg: 'rgba(0,255,163,0.1)',
    progressIndex: 5,
    terminal: false,
    actionable: true,
  };
}

export function mapEscrowUiStateToTimelineState(uiState) {
  switch (uiState?.state) {
    case 'COMPLETED':
    case 'RELEASED':
      return 'COMPLETED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'DISPUTED':
      return 'DELIVERY_IN_PROGRESS';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'DELIVERY_PENDING':
      return 'DELIVERY_IN_PROGRESS';
    case 'ESCROW_LOCKED':
      return 'PAYMENT_SECURED';
    case 'FUNDED':
      return 'AWAITING_PAYMENT';
    case 'CREATED':
    default:
      return 'PENDING_CONFIRMATION';
  }
}
