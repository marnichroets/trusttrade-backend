import { getTransactionFlowType, resolveEscrowUiState } from '../components/transactionState';

export const ACTIVITY_LAST_SEEN_KEY = 'trusttrade:lastSeenActivityAt';

const EVENT_ORDER = [
  'transaction_created',
  'buyer_joined',
  'escrow_funded',
  'seller_dispatched',
  'buyer_confirmed',
  'funds_released',
  'payout_processing',
  'payout_completed',
  'dispute_opened',
  'dispute_resolved',
];

function firstValue(...values) {
  return values.find(Boolean) || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUserBuyer(transaction, user) {
  return transaction?.buyer_user_id === user?.user_id ||
    (transaction?.buyer_email && user?.email && transaction.buyer_email.toLowerCase() === user.email.toLowerCase());
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneMatches(transactionValue, user) {
  const transactionPhone = normalizePhone(transactionValue);
  const userPhone = normalizePhone(user?.phone);
  return Boolean(transactionPhone && userPhone && transactionPhone === userPhone);
}

function isUserSeller(transaction, user) {
  return transaction?.seller_user_id === user?.user_id ||
    (transaction?.seller_email && user?.email && transaction.seller_email.toLowerCase() === user.email.toLowerCase()) ||
    (transaction?.freelancer_email && user?.email && transaction.freelancer_email.toLowerCase() === user.email.toLowerCase());
}

function isUserParticipant(transaction, user) {
  return Boolean(transaction && user && (
    isUserBuyer(transaction, user) ||
    isUserSeller(transaction, user) ||
    (transaction?.recipient_info && user?.email && transaction.recipient_info.toLowerCase() === user.email.toLowerCase()) ||
    phoneMatches(transaction?.buyer_phone, user) ||
    phoneMatches(transaction?.seller_phone, user) ||
    phoneMatches(transaction?.recipient_info, user)
  ));
}

function eventCopy(type, role, transaction) {
  const item = transaction?.item_description || transaction?.title || 'Protected transaction';
  const copy = {
    transaction_created: {
      title: role === 'buyer' ? 'Your transaction was created' : 'Transaction created',
      detail: `${item} is now tracked by TrustTrade.`,
      tone: 'slate',
      icon: 'file',
    },
    buyer_joined: {
      title: role === 'buyer' ? 'You joined the transaction' : 'Buyer joined the transaction',
      detail: 'Both parties can now review the escrow flow.',
      tone: 'blue',
      icon: 'user',
    },
    escrow_funded: {
      title: role === 'buyer' ? 'You funded escrow' : role === 'seller' ? 'Buyer secured funds in escrow' : 'Escrow funded',
      detail: role === 'seller' ? 'The buyer payment is protected before release.' : 'Funds are protected until release conditions are met.',
      tone: 'green',
      icon: 'shield',
    },
    seller_dispatched: {
      title: role === 'buyer' ? 'Seller marked item as dispatched' : role === 'seller' ? 'You marked the item as dispatched' : 'Seller dispatched',
      detail: 'Delivery is in progress and escrow remains protected.',
      tone: 'blue',
      icon: 'truck',
    },
    buyer_confirmed: {
      title: role === 'buyer' ? 'You confirmed delivery' : 'Buyer confirmed delivery',
      detail: 'Release conditions were met and escrow can move to payout.',
      tone: 'green',
      icon: 'check',
    },
    funds_released: {
      title: 'Funds released from escrow',
      detail: role === 'seller' ? 'Your payout is now moving through the banking system.' : 'Escrow release is complete.',
      tone: 'green',
      icon: 'banknote',
    },
    payout_processing: {
      title: role === 'seller' ? 'Your payout is processing' : 'Payout processing',
      detail: 'Funds have been released from escrow and are moving through banking rails.',
      tone: 'amber',
      icon: 'activity',
    },
    payout_completed: {
      title: 'Payout completed',
      detail: 'Bank settlement evidence has been recorded.',
      tone: 'green',
      icon: 'check',
    },
    dispute_opened: {
      title: 'Dispute opened',
      detail: 'Payout protection is active while TrustTrade reviews the case.',
      tone: 'red',
      icon: 'alert',
    },
    dispute_resolved: {
      title: 'Dispute resolved',
      detail: 'The protection case has been closed.',
      tone: 'green',
      icon: 'check',
    },
  };

  return copy[type] || copy.transaction_created;
}

function buildBaseEvent({ type, transaction, user, timestamp, state, currentType }) {
  const role = isUserBuyer(transaction, user) ? 'buyer' : isUserSeller(transaction, user) ? 'seller' : 'viewer';
  const copy = eventCopy(type, role, transaction);
  const date = normalizeDate(timestamp);
  const currentIndex = EVENT_ORDER.indexOf(currentType);
  const typeIndex = EVENT_ORDER.indexOf(type);
  const derivedStatus = date
    ? 'completed'
    : type === currentType
      ? 'current'
      : typeIndex > -1 && currentIndex > -1 && typeIndex < currentIndex
        ? 'completed'
        : 'upcoming';

  return {
    id: `${transaction.transaction_id || transaction.share_code || 'transaction'}:${type}`,
    type,
    title: copy.title,
    detail: copy.detail,
    tone: copy.tone,
    icon: copy.icon,
    role,
    transactionId: transaction.transaction_id,
    shareCode: transaction.share_code,
    item: transaction.item_description || transaction.title || 'Protected transaction',
    timestamp: date ? date.toISOString() : null,
    sortTime: date ? date.getTime() : 0,
    status: state || derivedStatus,
    path: transaction.transaction_id ? `/transactions/${transaction.transaction_id}` : '/transactions',
  };
}

function eventTimestamp(type, transaction) {
  switch (type) {
    case 'transaction_created':
      return firstValue(transaction.created_at, transaction.createdAt);
    case 'buyer_joined':
      return firstValue(transaction.buyer_joined_at, transaction.buyer_confirmed_at);
    case 'escrow_funded':
      return firstValue(transaction.escrow_funded_at, transaction.funds_received_at, transaction.payment_completed_at, transaction.paid_at, transaction.tradesafe_paid_at);
    case 'seller_dispatched':
      return firstValue(transaction.seller_dispatched_at, transaction.delivery_started_at, transaction.delivery_marked_at, transaction.dispatched_at, transaction.delivery_updated_at);
    case 'buyer_confirmed':
      return firstValue(transaction.buyer_confirmed_delivery_at, transaction.delivery_confirmed_at, transaction.buyer_delivery_confirmed_at);
    case 'funds_released':
      return firstValue(transaction.released_at, transaction.funds_released_at, transaction.completed_at);
    case 'payout_processing':
      return firstValue(transaction.payout_processing_started_at, transaction.withdrawal_requested_at, transaction.withdrawal_started_at, transaction.withdrawal_triggered_at);
    case 'payout_completed':
      return firstValue(transaction.settlement_confirmed_at, transaction.withdrawal_completed_at);
    default:
      return null;
  }
}

function hasSettlementEvidence(transaction) {
  return Boolean(
    transaction.settlement_confirmed_at ||
    transaction.withdrawal_completed_at ||
    transaction.bank_reference ||
    transaction.settlement_reference ||
    String(transaction.settlement_status || '').toLowerCase() === 'settlement_confirmed'
  );
}

function currentEventType(transaction, disputes = []) {
  const uiState = resolveEscrowUiState(transaction, disputes);
  if (uiState.state === 'DISPUTED') return 'dispute_opened';
  if (uiState.state === 'FUNDED') return 'buyer_joined';
  if (uiState.state === 'ESCROW_LOCKED') return 'escrow_funded';
  if (uiState.state === 'DELIVERY_PENDING') return getTransactionFlowType(transaction) === 'delivery' ? 'seller_dispatched' : 'buyer_confirmed';
  if (uiState.state === 'DELIVERED') return 'buyer_confirmed';
  if (uiState.state === 'RELEASED') return 'payout_processing';
  if (uiState.state === 'COMPLETED') return 'payout_completed';
  return 'transaction_created';
}

function disputeEvents(transaction, disputes, user) {
  return disputes
    .filter((dispute) => String(dispute.transaction_id || dispute.transactionId || '') === String(transaction.transaction_id || ''))
    .flatMap((dispute) => {
      const openedAt = firstValue(dispute.opened_at, dispute.created_at, dispute.createdAt);
      const resolvedAt = firstValue(dispute.resolved_at, dispute.closed_at, dispute.updated_at);
      const isResolved = ['resolved', 'closed'].includes(String(dispute.status || '').toLowerCase());
      return [
        buildBaseEvent({ type: 'dispute_opened', transaction, user, timestamp: openedAt, state: openedAt ? 'completed' : 'current' }),
        ...(isResolved ? [buildBaseEvent({ type: 'dispute_resolved', transaction, user, timestamp: resolvedAt, state: resolvedAt ? 'completed' : 'current' })] : []),
      ];
    });
}

export function buildTransactionActivity(transaction, options = {}) {
  const { user = null, disputes = [], includeUpcoming = false, chronological = true } = options;
  const flowType = getTransactionFlowType(transaction);
  const currentType = currentEventType(transaction, disputes);
  const events = EVENT_ORDER
    .filter((type) => flowType === 'delivery' || type !== 'seller_dispatched')
    .filter((type) => type !== 'dispute_opened' && type !== 'dispute_resolved')
    .map((type) => buildBaseEvent({
      type,
      transaction,
      user,
      timestamp: eventTimestamp(type, transaction),
      state: type === 'payout_completed' && hasSettlementEvidence(transaction) ? 'completed' : undefined,
      currentType,
    }))
    .filter((event) => includeUpcoming || event.timestamp || event.status === 'current');

  const merged = [...events, ...disputeEvents(transaction, disputes, user)]
    .filter((event, index, list) => list.findIndex((candidate) => candidate.id === event.id) === index);

  return merged.sort((a, b) => {
    const aIndex = EVENT_ORDER.indexOf(a.type);
    const bIndex = EVENT_ORDER.indexOf(b.type);
    if (chronological) {
      if (a.sortTime && b.sortTime) return a.sortTime - b.sortTime;
      return aIndex - bIndex;
    }
    return (b.sortTime || bIndex) - (a.sortTime || aIndex);
  });
}

export function buildUserActivityFeed(transactions = [], options = {}) {
  const { user = null, disputes = [], limit = 8, activeFirst = true } = options;
  const userTransactions = transactions.filter((transaction) => isUserParticipant(transaction, user));
  const events = userTransactions.flatMap((transaction) =>
    buildTransactionActivity(transaction, { user, disputes, includeUpcoming: false, chronological: false })
      .map((event) => ({
        ...event,
        active: !resolveEscrowUiState(transaction, disputes).terminal,
      }))
  );

  return events
    .sort((a, b) => {
      if (activeFirst && a.active !== b.active) return a.active ? -1 : 1;
      return b.sortTime - a.sortTime;
    })
    .slice(0, limit);
}

export function getLastSeenActivityAt() {
  const value = window.localStorage.getItem(ACTIVITY_LAST_SEEN_KEY);
  return Number(value || 0);
}

export function markActivitySeen(timestamp = Date.now()) {
  window.localStorage.setItem(ACTIVITY_LAST_SEEN_KEY, String(timestamp));
}

export function getUnreadActivityCount(events = []) {
  const lastSeen = getLastSeenActivityAt();
  return events.filter((event) => event.sortTime > lastSeen).length;
}
