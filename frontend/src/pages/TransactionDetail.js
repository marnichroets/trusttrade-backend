import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Timeline from '../components/Timeline';
import { TransactionTimeline } from '../components/TransactionTimeline';
import TransactionStatusCard from '../components/TransactionStatusCard';
import StepProgressTracker from '../components/StepProgressTracker';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import api from '../utils/api';
import { toast } from 'sonner';
import {
  ArrowLeft, FileText, User, Download, CheckCircle2, Image as ImageIcon,
  Star, Copy, Share2, Check, AlertTriangle, CreditCard, Truck, Shield,
  Loader2, Phone, Lock, RefreshCw, Clock, Banknote
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://trusttrade-backend-production-3efa.up.railway.app';
const API = BASE_URL ? `${BASE_URL}/api` : '/api';

function parseErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (!detail) return 'An error occurred';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  if (typeof detail === 'object') return detail.msg || detail.message || JSON.stringify(detail);
  return 'An error occurred';
}

function TransactionDetail() {
  const API_BASE = process.env.REACT_APP_API_URL || '';
  const BASE_URL_LOCAL = API_BASE.replace('/api', '');
  const [user, setUser] = useState(null);
  const [profileIncompleteError, setProfileIncompleteError] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sellerConfirming, setSellerConfirming] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingEscrow, setCreatingEscrow] = useState(false);
  const [loadingPaymentLink, setLoadingPaymentLink] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [acceptingDelivery, setAcceptingDelivery] = useState(false);
  const [payoutReadiness, setPayoutReadiness] = useState(null);
  const [checkingPayoutReadiness, setCheckingPayoutReadiness] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [needsPhoneVerification, setNeedsPhoneVerification] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState(null);
  const [remainingOtpRequests, setRemainingOtpRequests] = useState(3);
  const [remainingVerifyAttempts, setRemainingVerifyAttempts] = useState(5);
  const [otpExpiresIn, setOtpExpiresIn] = useState(10);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(null);
  const [phoneVerificationContext, setPhoneVerificationContext] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();
  const { transactionId } = useParams();

  useEffect(() => { fetchData(); }, [transactionId]);

  useEffect(() => {
    if (!transaction || !user) return;
    const isBuyerUser = transaction.buyer_email === user.email || transaction.buyer_user_id === user.user_id;
    const escrowState = transaction.tradesafe_state;
    const hasEscrow = !!transaction.tradesafe_id;
    const canRelease = hasEscrow && isBuyerUser && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState);
    if (canRelease && !payoutReadiness) checkPayoutReadiness();
  }, [transaction, user]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (!transaction) return;
    const activeStates = ['Awaiting Payment', 'Pending Seller Confirmation', 'Pending Buyer Confirmation', 'Ready for Payment', 'Funds Secured', 'Delivery in Progress', 'Awaiting Release'];
    if (activeStates.includes(transaction.payment_status)) {
      const interval = setInterval(() => fetchData(), 8000);
      return () => clearInterval(interval);
    }
  }, [transaction?.payment_status, transactionId]);

  // Refresh immediately when user returns to tab after completing payment
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchData);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchData);
    };
  }, [transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
      if (userRes.data.phone) setPhoneNumber(userRes.data.phone);
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data);
      setNeedsPhoneVerification(false);
      setPhoneVerificationContext(null);
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      const errorStatus = error.response?.status;
      if (errorStatus === 403 && typeof errorDetail === 'object' && errorDetail?.type === 'phone_verification_required') {
        setNeedsPhoneVerification(true);
        setPhoneVerificationContext({ maskedPhone: errorDetail.invited_phone_masked, inviteType: errorDetail.invite_type, itemDescription: errorDetail.item_description, itemPrice: errorDetail.item_price, message: errorDetail.message });
        setVerificationError(errorDetail.message);
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); if (userRes.data.phone) setPhoneNumber(userRes.data.phone); } catch (e) {}
      } else if (errorStatus === 403 && typeof errorDetail === 'string' && (errorDetail.includes('phone') || errorDetail.includes('Phone'))) {
        setNeedsPhoneVerification(true); setVerificationError(errorDetail);
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); if (userRes.data.phone) setPhoneNumber(userRes.data.phone); } catch (e) {}
      } else if (errorStatus === 403) {
        const errorMsg = typeof errorDetail === 'string' ? errorDetail : (errorDetail?.message || 'Access denied');
        const match = errorMsg.match(/sent to (?:email address |phone number )?([^\s.]+)/i);
        const expectedEmail = match ? match[1] : 'the invited account';
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); setWrongAccount({ expected: expectedEmail, current: userRes.data.email, message: errorMsg }); } catch (e) { setWrongAccount({ expected: expectedEmail, current: 'current account', message: errorMsg }); }
      } else { toast.error('Transaction not found'); navigate('/transactions'); }
    } finally { setLoading(false); }
  };

  const validatePhoneAgainstMask = (enteredPhone, maskedPhone) => {
    if (!maskedPhone) return true;
    let normalized = enteredPhone.replace(/[\s\-\+]/g, '');
    if (normalized.startsWith('0')) normalized = normalized.slice(1);
    if (normalized.startsWith('27')) normalized = normalized.slice(2);
    if (normalized.length < 9) return false;
    const match = maskedPhone.match(/(\d{4})$/);
    if (match) return normalized.endsWith(match[1]);
    return true;
  };

  const handleSendOtp = async () => {
    setVerificationError(null);
    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 9) { toast.error('Please enter a valid phone number'); return; }
    if (isLockedOut) { toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`); return; }
    const maskedPhone = phoneVerificationContext?.maskedPhone;
    if (maskedPhone && !validatePhoneAgainstMask(phoneNumber, maskedPhone)) { setVerificationError(`Phone number doesn't match. Expected ending: ${maskedPhone.slice(-4)}.`); toast.error(`Phone number doesn't match. Expected ending: ${maskedPhone.slice(-4)}`); return; }
    setSendingOtp(true);
    try {
      const response = await api.post(`${API}/verification/phone/send-otp`, { phone_number: phoneNumber, expected_phone_masked: maskedPhone || null }, { withCredentials: true });
      setOtpSent(true); setResendCooldown(response.data.cooldown_seconds || 60); setRemainingOtpRequests(response.data.remaining_requests ?? 2); setOtpExpiresIn(response.data.expires_in_minutes || 10); setRemainingVerifyAttempts(5);
      toast.success(`Verification code sent! Expires in ${response.data.expires_in_minutes || 10} minutes.`);
    } catch (error) {
      const errorDetail = error.response?.data?.detail || 'Failed to send verification code';
      if (error.response?.status === 429) { if (errorDetail.includes('locked') || errorDetail.includes('Too many failed')) { setIsLockedOut(true); const minutes = errorDetail.match(/(\d+) minutes/); setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30); } toast.error(errorDetail); }
      else if (errorDetail.includes("doesn't match")) { setVerificationError(errorDetail); toast.error('Phone number mismatch'); }
      else toast.error(errorDetail);
    } finally { setSendingOtp(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) { toast.error('Please enter the 6-digit code'); return; }
    if (isLockedOut) { toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`); return; }
    setVerifyingOtp(true); setVerificationError(null);
    try {
      await api.post(`${API}/verification/phone/verify-otp`, { phone_number: phoneNumber, otp: otpCode }, { withCredentials: true });
      toast.success('Phone verified successfully!');
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data); setNeedsPhoneVerification(false); setVerificationError(null); setIsLockedOut(false);
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data);
      toast.success('You have joined the transaction!');
    } catch (error) {
      const errorDetail = error.response?.data?.detail || 'Verification failed';
      if (error.response?.status === 429) { setIsLockedOut(true); const minutes = errorDetail.match(/(\d+) minutes/); setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30); setVerificationError(errorDetail); toast.error(errorDetail); }
      else if (errorDetail.includes('expired')) { setOtpSent(false); setOtpCode(''); setVerificationError('Verification code expired. Please request a new code.'); toast.error('Code expired. Request a new one.'); }
      else if (errorDetail.includes('attempts remaining')) { const remaining = errorDetail.match(/(\d+) attempts/); if (remaining) setRemainingVerifyAttempts(parseInt(remaining[1])); setVerificationError(errorDetail); toast.error(errorDetail); }
      else if (errorDetail.includes('No verification code')) { setOtpSent(false); setOtpCode(''); toast.error('Please request a new verification code.'); }
      else { setVerificationError(errorDetail); toast.error(errorDetail); }
    } finally { setVerifyingOtp(false); }
  };

  const handleSellerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details?')) return;
    setSellerConfirming(true);
    try {
      const res = await api.post(`${API}/transactions/${transactionId}/seller-confirm`, { confirmed: true }, { withCredentials: true });
      toast.success('Transaction confirmed!'); fetchData();
    } catch (error) {
      const errMsg = parseErrorMessage(error);
      if (errMsg && errMsg.startsWith('MISSING_PROFILE:')) {
        const missing = errMsg.replace('MISSING_PROFILE: ', '');
        setProfileIncompleteError(missing);
        toast.error(`Complete your profile first: ${missing}`);
      } else { toast.error(errMsg || 'Failed to confirm transaction'); }
    } finally { setSellerConfirming(false); }
  };

  const handleBuyerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details?')) return;
    setConfirming(true);
    try { await api.post(`${API}/transactions/${transactionId}/buyer-confirm`, { confirmed: true }, { withCredentials: true }); toast.success('Transaction confirmed!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to confirm transaction'); }
    finally { setConfirming(false); }
  };

  const handleConfirmDelivery = async () => {
    if (!window.confirm('Are you sure you want to confirm delivery and release the funds to the seller?')) return;
    setConfirming(true);
    try { await api.patch(`${API}/transactions/${transactionId}/delivery`, { delivery_confirmed: true }, { withCredentials: true }); toast.success('Delivery confirmed and funds released!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery'); }
    finally { setConfirming(false); }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(`${API}/transactions/${transactionId}/agreement-pdf`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `TrustTrade_Agreement_${transactionId}.pdf`); document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success('Agreement downloaded');
    } catch (error) { toast.error('Agreement not available yet'); }
  };

  const handleSyncStatus = async () => {
    if (!transaction.tradesafe_id) { toast.info('No escrow linked to sync'); fetchData(); return; }
    setSyncing(true);
    try {
      const response = await api.post(`${API}/tradesafe/sync/${transactionId}`, {}, { withCredentials: true });
      if (response.data.state_changed) toast.success(`Status updated: ${response.data.new_payment_status}`); else toast.info('Status is up to date');
      fetchData();
    } catch (error) { toast.error(parseErrorMessage(error) || 'Failed to sync status'); fetchData(); }
    finally { setSyncing(false); }
  };

  const handleCreateEscrow = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!window.confirm('This will create a secure TrustTrade escrow. The buyer will then need to make payment. Proceed?')) return;
    setCreatingEscrow(true); toast.info('Creating escrow...');
    try {
      await api.post(`${API}/tradesafe/create-transaction`, { transaction_id: transactionId, fee_allocation: transaction.fee_allocation || 'SELLER_AGENT' }, { withCredentials: true });
      toast.success('TrustTrade escrow created! Buyer can now make payment.'); fetchData();
    } catch (error) { const errorMessage = error.response?.data?.detail || parseErrorMessage(error) || 'Failed to create escrow.'; toast.error(errorMessage); alert('Error: ' + errorMessage); }
    finally { setCreatingEscrow(false); }
  };

  const handleGetPaymentLink = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!selectedPaymentMethod) { toast.error('Please select a payment method first'); return; }
    setLoadingPaymentLink(true); toast.info('Loading payment page...');
    try {
      const response = await api.get(`${API}/tradesafe/payment-url/${transactionId}?payment_method=${selectedPaymentMethod}`, { withCredentials: true });
      setPaymentInfo(response.data);
      if (response.data.already_paid) { toast.success('This transaction has already been paid.'); setTransaction(prev => ({ ...prev, tradesafe_state: response.data.state, status: 'paid' })); return; }
      if (response.data.payment_link) { const newWindow = window.open(response.data.payment_link, '_blank'); if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') window.location.href = response.data.payment_link; toast.success('Secure payment page opened.'); }
      else { setPaymentInfo(response.data); toast.info('Payment deposit created.'); }
    } catch (error) { const errorMessage = error.response?.data?.detail || 'Payment processing error.'; toast.error(errorMessage); alert('Error: ' + errorMessage); }
    finally { setLoadingPaymentLink(false); }
  };

  const handleStartDelivery = async () => {
    if (!window.confirm('Mark this item as dispatched/delivered?')) return;
    setStartingDelivery(true);
    try { await api.post(`${API}/tradesafe/start-delivery/${transactionId}`, {}, { withCredentials: true }); toast.success('Delivery started!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to start delivery.'); }
    finally { setStartingDelivery(false); }
  };

  const handleManualStartDelivery = async () => {
    if (!window.confirm('MANUAL OVERRIDE: Mark as dispatched?')) return;
    setStartingDelivery(true);
    try { await api.post(`${API}/tradesafe/manual-start-delivery/${transactionId}`, {}, { withCredentials: true }); toast.success('Delivery manually started!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to start delivery.'); }
    finally { setStartingDelivery(false); }
  };

  const checkPayoutReadiness = async () => {
    if (!transactionId) return;
    setCheckingPayoutReadiness(true);
    try { const response = await api.get(`${API}/tradesafe/payout-readiness/${transactionId}`, { withCredentials: true }); setPayoutReadiness(response.data); }
    catch (error) { setPayoutReadiness({ payout_ready: null, issues: ['Could not verify payout readiness'] }); }
    finally { setCheckingPayoutReadiness(false); }
  };

  const handleAcceptDelivery = async () => {
    if (!payoutReadiness?.payout_ready) { await checkPayoutReadiness(); if (!payoutReadiness?.payout_ready) { const issues = payoutReadiness?.issues?.join(', ') || 'Unknown issue'; toast.warning(`Seller payout setup incomplete. ${issues}`); } }
    if (!window.confirm('Confirm you have received the item? This will release funds to the seller. This action cannot be undone.')) return;
    setAcceptingDelivery(true);
    try { const response = await api.post(`${API}/tradesafe/accept-delivery/${transactionId}`, {}, { withCredentials: true }); toast.success(`Delivery confirmed! R${response.data.net_amount?.toFixed(2) || ''} released to seller.`); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery.'); }
    finally { setAcceptingDelivery(false); }
  };

  const handleManualAcceptDelivery = async () => {
    if (!window.confirm('MANUAL OVERRIDE: Confirm receipt and release funds?')) return;
    setAcceptingDelivery(true);
    try { const response = await api.post(`${API}/tradesafe/manual-accept-delivery/${transactionId}`, {}, { withCredentials: true }); toast.success(`Delivery confirmed! R${response.data.net_amount?.toFixed(2) || ''} released to seller.`); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery.'); }
    finally { setAcceptingDelivery(false); }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) { toast.error('Please select a rating'); return; }
    setSubmittingRating(true);
    try { await api.post(`${API}/transactions/${transactionId}/rate`, { rating, review: review.trim() || null }, { withCredentials: true }); toast.success('Rating submitted!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to submit rating'); }
    finally { setSubmittingRating(false); }
  };

  const StarRating = ({ value, onSelect, onHover, readOnly = false, size = 'w-8 h-8' }) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1,2,3,4,5].map((star) => (
        <button key={star} type="button" disabled={readOnly}
          onClick={() => !readOnly && onSelect && onSelect(star)}
          onMouseEnter={() => !readOnly && onHover && onHover(star)}
          onMouseLeave={() => !readOnly && onHover && onHover(0)}
          data-testid={`star-${star}`}
          style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 2, transition: 'transform 0.1s', transform: 'scale(1)' }}
        >
          <Star style={{ width: 24, height: 24, fill: star <= (readOnly ? value : (hoverRating || value)) ? '#fbbf24' : 'none', color: star <= (readOnly ? value : (hoverRating || value)) ? '#fbbf24' : '#d1d5db' }} />
        </button>
      ))}
    </div>
  );

  const getEscrowStateBadge = (state) => {
    const variants = { 'CREATED': { bg: '#f1f5f9', text: '#475569', label: 'Created' }, 'PENDING': { bg: '#fefce8', text: '#854d0e', label: 'Pending' }, 'FUNDS_RECEIVED': { bg: '#ecfdf5', text: '#065f46', label: 'Funds Secured' }, 'INITIATED': { bg: '#f5f3ff', text: '#5b21b6', label: 'Delivery Started' }, 'SENT': { bg: '#eff6ff', text: '#1e40af', label: 'Item Sent' }, 'DELIVERED': { bg: '#fffbeb', text: '#92400e', label: 'Awaiting Confirmation' }, 'FUNDS_RELEASED': { bg: '#ecfdf5', text: '#14532d', label: 'Funds Released' }, 'DISPUTED': { bg: '#fef2f2', text: '#7f1d1d', label: 'Disputed' }, 'CANCELLED': { bg: '#fef2f2', text: '#7f1d1d', label: 'Cancelled' } };
    return variants[state] || { bg: '#f1f5f9', text: '#475569', label: state };
  };

  const mapPaymentStatusToState = (paymentStatus, tradesafeState) => {
    const ps = (paymentStatus || '').toLowerCase(); const ts = (tradesafeState || '').toUpperCase();
    if (ts === 'FUNDS_RELEASED' || ps.includes('completed') || ps.includes('released')) return 'COMPLETED';
    if (ts === 'DELIVERED' || ps.includes('delivered')) return 'DELIVERED';
    if (ts === 'INITIATED' || ts === 'SENT' || ps.includes('delivery') || ps.includes('dispatched')) return 'DELIVERY_IN_PROGRESS';
    if (ts === 'FUNDS_RECEIVED' || ps.includes('escrow') || ps.includes('secured') || ps === 'paid') return 'PAYMENT_SECURED';
    if (ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING') return 'AWAITING_PAYMENT';
    if (ps.includes('pending') || ps.includes('confirmation')) return 'PENDING_CONFIRMATION';
    if (ps.includes('dispute')) return 'DISPUTED';
    if (ps.includes('cancel')) return 'CANCELLED';
    if (ps.includes('refund')) return 'REFUNDED';
    return 'CREATED';
  };

  const getFeePayerLabel = (feeAllocation) => {
    if (!feeAllocation) return 'Seller pays fee';
    switch(feeAllocation.toUpperCase()) {
      case 'BUYER_AGENT': case 'BUYER': return 'Buyer pays fee';
      case 'SELLER_AGENT': case 'SELLER': return 'Seller pays fee';
      case 'SPLIT_AGENT': case 'BUYER_SELLER_AGENT': case 'SPLIT': return 'Fee split 50/50';
      default: return 'Seller pays fee';
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────
  const S = {
    card: { background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)', overflow: 'hidden' },
    label: { fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 },
    divider: { height: 1, background: '#f1f5f9', margin: '12px 0' },
    pill: (bg, color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, background: bg, color }),
    actionCard: (accent, bg) => ({
      background: bg, border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`,
      borderRadius: 14, padding: '20px 22px',
      boxShadow: `0 2px 12px ${accent}11`,
    }),
    btn: (bg, color = '#fff') => ({
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px',
      borderRadius: 9, border: 'none', background: bg, color, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', transition: 'opacity 0.15s', whiteSpace: 'nowrap',
    }),
    btnOutline: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f8fafc' },
  };

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#64748b' }}>Loading transaction…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  // ── Phone verification ──────────────────────────────────────────────
  if (needsPhoneVerification) {
    return (
      <DashboardLayout user={user}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ ...S.card, padding: '36px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Phone size={24} color="#3b82f6" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Verify Your Phone</h1>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>This transaction was sent to a phone number. Verify to access it.</p>
            </div>

            {phoneVerificationContext && (
              <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                {phoneVerificationContext.itemDescription && <div style={S.infoRow}><span style={{ fontSize: 12, color: '#94a3b8' }}>Item</span><span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{phoneVerificationContext.itemDescription}</span></div>}
                {phoneVerificationContext.itemPrice > 0 && <div style={{ ...S.infoRow, borderBottom: 'none' }}><span style={{ fontSize: 12, color: '#94a3b8' }}>Amount</span><span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>R {phoneVerificationContext.itemPrice.toFixed(2)}</span></div>}
                {phoneVerificationContext.maskedPhone && <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: '#94a3b8' }}>Sent to</span><span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>{phoneVerificationContext.maskedPhone}</span></div>}
              </div>
            )}

            {verificationError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
                <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>{verificationError}</p>
              </div>
            )}
            {isLockedOut && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Lock size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div><p style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', margin: '0 0 3px' }}>Account Temporarily Locked</p><p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>Try again in {lockoutMinutes} minutes.</p></div>
                </div>
              </div>
            )}

            {!otpSent ? (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Phone Number</label>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Phone size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <Input type="tel" placeholder="+27 82 123 4567" value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value); if (verificationError?.includes("doesn't match")) setVerificationError(null); }} style={{ paddingLeft: 36 }} data-testid="phone-input" disabled={isLockedOut} />
                </div>
                {phoneVerificationContext?.maskedPhone && <p style={{ fontSize: 12, color: '#3b82f6', marginBottom: 16 }}>Enter the number matching: {phoneVerificationContext.maskedPhone}</p>}
                <button onClick={handleSendOtp} disabled={sendingOtp || !phoneNumber || isLockedOut} data-testid="send-otp-btn" style={{ ...S.btn('#3b82f6'), width: '100%', justifyContent: 'center', opacity: (sendingOtp || !phoneNumber || isLockedOut) ? 0.5 : 1 }}>
                  {sendingOtp ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</> : isLockedOut ? `Locked — Try in ${lockoutMinutes}m` : 'Send Verification Code'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={14} color="#10b981" /><span style={{ fontSize: 13, color: '#065f46' }}>Code sent to <strong>{phoneNumber}</strong></span></div>
                  <span style={{ fontSize: 12, color: '#059669' }}>Expires {otpExpiresIn}m</span>
                </div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Verification Code</label>
                <Input type="text" placeholder="000000" value={otpCode} onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g,'').slice(0,6)); if (verificationError?.includes('attempts')) setVerificationError(null); }} style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em', fontFamily: 'monospace', marginBottom: 4 }} maxLength={6} data-testid="otp-input" disabled={isLockedOut} />
                <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 16 }}>Code expires in {otpExpiresIn} minutes</p>
                {remainingVerifyAttempts < 5 && <p style={{ fontSize: 12, color: '#f59e0b', textAlign: 'center', marginBottom: 12 }}>{remainingVerifyAttempts} attempts remaining</p>}
                <button onClick={handleVerifyOtp} disabled={verifyingOtp || otpCode.length !== 6 || isLockedOut} data-testid="verify-otp-btn" style={{ ...S.btn('#10b981'), width: '100%', justifyContent: 'center', opacity: (verifyingOtp || otpCode.length !== 6 || isLockedOut) ? 0.5 : 1, marginBottom: 12 }}>
                  {verifyingOtp ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Verifying…</> : isLockedOut ? `Locked — Try in ${lockoutMinutes}m` : 'Verify & Join Transaction'}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <button onClick={() => { setOtpSent(false); setOtpCode(''); setVerificationError(null); }} disabled={isLockedOut} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Change number</button>
                  {resendCooldown > 0 ? <span style={{ color: '#94a3b8' }}>Resend in {resendCooldown}s</span> : remainingOtpRequests > 0 && !isLockedOut ? <button onClick={handleSendOtp} disabled={sendingOtp} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }}>Resend ({remainingOtpRequests} left)</button> : <span style={{ color: '#94a3b8', fontSize: 12 }}>No more requests</span>}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => navigate('/transactions')} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>
                <ArrowLeft size={13} /> Back to My Transactions
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Wrong account ───────────────────────────────────────────────────
  if (wrongAccount) {
    const handleLogout = async () => {
      try { await api.post('/auth/logout', {}, { withCredentials: true }); localStorage.removeItem('session_token'); window.location.href = '/login'; }
      catch (error) { window.location.href = '/login'; }
    };
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ ...S.card, padding: '36px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle size={24} color="#f59e0b" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Wrong Account</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>This transaction was sent to a different account.</p>
            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '16px', textAlign: 'left', marginBottom: 20 }}>
              <div style={{ marginBottom: 12 }}><p style={{ ...S.label, marginBottom: 4 }}>Transaction sent to</p><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{wrongAccount.expected}</p></div>
              <div style={{ paddingTop: 12, borderTop: '1px solid #e2e8f0' }}><p style={{ ...S.label, marginBottom: 4 }}>You are logged in as</p><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{wrongAccount.current}</p></div>
            </div>
            <button onClick={handleLogout} style={{ ...S.btn('#0f1729'), width: '100%', justifyContent: 'center', marginBottom: 10 }}>Log Out and Switch Account</button>
            <button onClick={() => navigate('/transactions')} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>Continue as {wrongAccount.current?.split('@')[0]}</button>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>Log out and sign in with {wrongAccount.expected} to view this transaction.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!transaction) return null;

  // ── Computed flags ──────────────────────────────────────────────────
  const isBuyer = user?.user_id === transaction.buyer_user_id || (user?.email && transaction.buyer_email && user.email.toLowerCase() === transaction.buyer_email.toLowerCase());
  const isSeller = user?.user_id === transaction.seller_user_id || (user?.email && transaction.seller_email && user.email.toLowerCase() === transaction.seller_email.toLowerCase());
  console.log('Role Detection:', { userEmail: user?.email, userId: user?.user_id, buyerEmail: transaction.buyer_email, buyerUserId: transaction.buyer_user_id, sellerEmail: transaction.seller_email, sellerUserId: transaction.seller_user_id, isBuyer, isSeller });

  const hasEscrow = !!transaction.tradesafe_id;
  const escrowState = transaction.tradesafe_state;
  const buyerConfirmed = transaction.buyer_confirmed;
  const sellerConfirmed = transaction.seller_confirmed;
  const bothConfirmed = buyerConfirmed && sellerConfirmed;
  const canBuyerConfirm = isBuyer && !buyerConfirmed;
  const canSellerConfirm = isSeller && !sellerConfirmed;
  const canCreateEscrow = isSeller && bothConfirmed && !hasEscrow && transaction.item_price >= 100;
  const canMakePayment = hasEscrow && isBuyer && !isSeller && bothConfirmed && (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  console.log('Payment Button Debug:', { hasEscrow, isBuyer, isSeller, escrowState, paymentStatus: transaction.payment_status, canMakePayment });
  const isAwaitingBuyerPayment = hasEscrow && isSeller && !isBuyer && (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  const canStartDelivery = hasEscrow && isSeller && escrowState === 'FUNDS_RECEIVED';
  const canManualStartDelivery = hasEscrow && isSeller &&
    (escrowState === 'FUNDS_RECEIVED' || transaction.funds_received_at || transaction.payment_status === 'Paid') &&
    transaction.payment_status !== 'Awaiting Payment' &&
    escrowState !== 'CREATED' &&
    escrowState !== 'PENDING';
  const canAcceptDeliveryTS = hasEscrow && isBuyer && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState);
  const canManualAcceptDelivery = hasEscrow && isBuyer && (transaction.payment_status === 'Delivery in Progress' || transaction.delivery_started_at || escrowState === 'INITIATED');
  const canConfirmDelivery = !hasEscrow && isBuyer && !transaction.delivery_confirmed && transaction.payment_status === 'Paid';
  const shareLink = transaction.share_code ? `${window.location.origin}/t/${transaction.share_code}` : null;
  const _fa = (transaction.fee_allocation || 'SELLER_AGENT').toUpperCase();
  const totalSecurePayment = transaction.item_price + (
    _fa === 'BUYER_AGENT' ? (transaction.trusttrade_fee || 0) :
    (_fa === 'SPLIT_AGENT' || _fa === 'BUYER_SELLER_AGENT') ? (transaction.trusttrade_fee || 0) / 2 :
    0
  );

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000); }
    catch (err) { toast.error('Failed to copy link'); }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <DashboardLayout user={user}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .td-tab{padding:9px 16px;border:none;background:transparent;font-size:13px;font-weight:500;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
        .td-tab.active{color:#0f172a;border-bottom-color:#0f172a;font-weight:600}
        .td-tab:hover{color:#0f172a}
        .pm-opt{border:1.5px solid #e2e8f0;borderRadius:12px;padding:14px 16px;cursor:pointer;transition:all 0.15s;background:#fff}
        .pm-opt:hover{border-color:#93c5fd}
        .pm-opt.selected{border-color:#3b82f6;background:#eff6ff;box-shadow:0 0 0 3px rgba(59,130,246,0.08)}
        .action-btn:hover{opacity:0.88}
        .action-btn:active{opacity:0.75}
      `}</style>

      <div style={{ maxWidth: 1000 }}>
        {/* Back */}
        <button onClick={() => navigate('/transactions')} data-testid="back-to-transactions-btn" style={{ ...S.btnOutline, marginBottom: 20 }}>
          <ArrowLeft size={13} /> Back
        </button>

        {/* Two-column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

          {/* ── Left column ─────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step Progress */}
            <div style={{ ...S.card, padding: '18px 20px' }}>
              <StepProgressTracker transaction={transaction} />
            </div>

            {/* Status card */}
            <TransactionStatusCard transaction={transaction} userRole={isBuyer ? 'buyer' : (isSeller ? 'seller' : 'viewer')} />

            {/* Escrow protection banner */}
            <div style={{ background: 'linear-gradient(135deg,#0f1729,#1e293b)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield size={16} color="#10b981" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>TrustTrade Escrow Protection</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {['Funds held securely in escrow', 'Seller paid only after buyer confirms delivery', 'Bank payout within 1–2 business days after release'].map((t, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                      <CheckCircle2 size={11} color={i < 2 ? '#10b981' : '#60a5fa'} />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Risk warning */}
            {transaction.risk_level && transaction.risk_level !== 'low' && (
              <div style={{ ...S.actionCard(transaction.risk_level === 'high' ? '#ef4444' : '#f59e0b', transaction.risk_level === 'high' ? '#fef2f2' : '#fffbeb') }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <AlertTriangle size={16} color={transaction.risk_level === 'high' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: transaction.risk_level === 'high' ? '#7f1d1d' : '#78350f', margin: '0 0 4px' }}>{transaction.risk_level === 'high' ? 'High Risk Transaction' : 'Proceed with Caution'}</p>
                    <p style={{ fontSize: 13, color: transaction.risk_level === 'high' ? '#b91c1c' : '#92400e', margin: 0 }}>Our system has flagged potential risks. Please verify the other party's identity.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation status */}
            {!bothConfirmed && (
              <div style={{ ...S.card, padding: '18px 20px' }}>
                <p style={{ ...S.label, marginBottom: 12 }}>Confirmation Status</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[{ name: transaction.buyer_name, role: 'Buyer', confirmed: buyerConfirmed, accent: '#3b82f6', bg: '#eff6ff' }, { name: transaction.seller_name, role: 'Seller', confirmed: sellerConfirmed, accent: '#f97316', bg: '#fff7ed' }].map(p => (
                    <div key={p.role} style={{ padding: '12px 14px', borderRadius: 10, background: p.confirmed ? '#ecfdf5' : '#f8fafc', border: `1px solid ${p.confirmed ? '#a7f3d0' : '#f1f5f9'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.confirmed ? '#ecfdf5' : p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={12} color={p.confirmed ? '#10b981' : p.accent} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{p.role}</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <span style={{ ...S.pill(p.confirmed ? '#ecfdf5' : '#f8fafc', p.confirmed ? '#059669' : '#f59e0b'), fontSize: 10 }}>
                        {p.confirmed ? '✓ Confirmed' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buyer confirm */}
            {canBuyerConfirm && (
              <div style={S.actionCard('#3b82f6', '#eff6ff')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#3b82f6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f', margin: '0 0 4px' }}>Action Required: Confirm Details</p>
                    <p style={{ fontSize: 13, color: '#3b82f6', margin: '0 0 14px' }}>Review the transaction details and confirm to proceed with escrow protection.</p>
                    <button onClick={handleBuyerConfirm} disabled={confirming} data-testid="buyer-confirm-btn" className="action-btn" style={{ ...S.btn('#3b82f6'), opacity: confirming ? 0.6 : 1 }}>
                      {confirming ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Confirming…</> : <><CheckCircle2 size={13} /> Confirm Transaction</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Seller confirm */}
            {canSellerConfirm && (
              <div style={S.actionCard('#f97316', '#fff7ed')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color="#f97316" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#7c2d12', margin: '0 0 4px' }}>Action Required: Confirm Fee Agreement</p>
                    <p style={{ fontSize: 13, color: '#ea580c', margin: '0 0 4px' }}>2% TrustTrade fee (min R5).</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', margin: '0 0 14px' }}>You'll receive R {(transaction.seller_receives ?? (transaction.item_price - transaction.trusttrade_fee))?.toFixed(2)}</p>
                    {profileIncompleteError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', margin: '0 0 4px' }}>Complete your profile first</p>
                        <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 8px' }}>Add your <strong>{profileIncompleteError}</strong> before confirming.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <Link to="/settings/banking" style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>Add banking details</Link>
                          <Link to="/verify/phone" style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>Add phone number</Link>
                        </div>
                      </div>
                    )}
                    <button onClick={handleSellerConfirm} disabled={sellerConfirming} data-testid="seller-confirm-btn" className="action-btn" style={{ ...S.btn('#f97316'), opacity: sellerConfirming ? 0.6 : 1 }}>
                      {sellerConfirming ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Confirming…</> : <><CheckCircle2 size={13} /> Confirm Fee Agreement</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Create escrow */}
            {canCreateEscrow && (
              <div style={S.actionCard('#10b981', '#ecfdf5')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Shield size={18} color="#059669" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#064e3b', margin: '0 0 4px' }}>Action Required: Create Escrow</p>
                    <p style={{ fontSize: 13, color: '#059669', margin: '0 0 14px' }}>Both parties confirmed. Create escrow to enable secure payment.</p>
                    <button type="button" onClick={handleCreateEscrow} onTouchEnd={handleCreateEscrow} disabled={creatingEscrow} data-testid="create-escrow-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: creatingEscrow ? 0.6 : 1 }}>
                      {creatingEscrow ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating…</> : <><Shield size={13} /> Create Escrow</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Make payment */}
            {canMakePayment && (
              <div style={{ ...S.card, padding: '22px 24px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={18} color="#3b82f6" />
                  </div>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Pay Securely with TrustTrade</p>
                    <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Select a payment method to complete your secure payment.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {[
                    { id: 'eft', emoji: '🏦', label: 'EFT Bank Transfer', desc: 'Direct bank transfer — most affordable', fee: '0.86%', badge: 'Recommended', badgeColor: '#10b981' },
                    { id: 'card', emoji: '💳', label: 'Credit / Debit Card', desc: 'Pay instantly with Visa or Mastercard', fee: '2.88%' },
                    { id: 'ozow', emoji: '⚡', label: 'Ozow Instant EFT', desc: 'Fast instant payment from your bank app', fee: '1.73%' },
                  ].map(pm => (
                    <div key={pm.id} onClick={() => setSelectedPaymentMethod(pm.id)} data-testid={`payment-method-${pm.id}`} className={`pm-opt${selectedPaymentMethod === pm.id ? ' selected' : ''}`} style={{ border: `1.5px solid ${selectedPaymentMethod === pm.id ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', background: selectedPaymentMethod === pm.id ? '#eff6ff' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selectedPaymentMethod === pm.id ? '#3b82f6' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selectedPaymentMethod === pm.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />}
                        </div>
                        <span style={{ fontSize: 20 }}>{pm.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{pm.label}</span>
                            {pm.badge && <span style={{ fontSize: 10, fontWeight: 700, background: '#ecfdf5', color: '#059669', padding: '1px 7px', borderRadius: 20 }}>{pm.badge}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 12 }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{pm.desc}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Fee: {pm.fee}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Price summary */}
                <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
                  <p style={{ ...S.label, marginBottom: 12 }}>Payment Summary</p>
                  {[
                    { label: 'Item Price', value: `R ${transaction.item_price?.toFixed(2)}` },
                    { label: 'TrustTrade Fee (2%, min R5)', value: `R ${Math.max(transaction.item_price * 0.02, 5)?.toFixed(2)}` },
                    { label: selectedPaymentMethod === 'eft' ? 'EFT Processing (0.86%)' : selectedPaymentMethod === 'card' ? 'Card Processing (2.88%)' : selectedPaymentMethod === 'ozow' ? 'Ozow Processing (1.73%)' : 'Processing Fee', value: selectedPaymentMethod ? `R ${(transaction.item_price * (selectedPaymentMethod === 'eft' ? 0.0086 : selectedPaymentMethod === 'card' ? 0.0288 : 0.0173))?.toFixed(2)}` : '—' },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: '#64748b' }}>{r.label}</span>
                      <span style={{ fontWeight: 500, color: '#0f172a' }}>{r.value}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Total Amount</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                      {selectedPaymentMethod ? `R ${(transaction.item_price * (selectedPaymentMethod === 'eft' ? 1.0286 : selectedPaymentMethod === 'card' ? 1.0488 : 1.0373) + Math.max(transaction.item_price * 0.02, 5))?.toFixed(2)}` : <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13 }}>Select method</span>}
                    </span>
                  </div>
                  {transaction.fee_allocation !== 'BUYER_AGENT' && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{transaction.fee_allocation === 'SELLER_AGENT' ? 'Fees deducted from seller payout' : 'Fees split between buyer and seller'}</p>}
                </div>

                <button type="button" onClick={handleGetPaymentLink} onTouchEnd={(e) => { e.preventDefault(); handleGetPaymentLink(e); }} disabled={loadingPaymentLink || !selectedPaymentMethod} data-testid="make-payment-btn" className="action-btn" style={{ ...S.btn(selectedPaymentMethod ? '#3b82f6' : '#94a3b8'), width: '100%', justifyContent: 'center', fontSize: 15, padding: '13px 20px', opacity: (loadingPaymentLink || !selectedPaymentMethod) ? 0.7 : 1 }}>
                  {loadingPaymentLink ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading Payment Page…</> : selectedPaymentMethod ? <><CreditCard size={15} /> Pay Securely</> : <><CreditCard size={15} style={{ opacity: 0.5 }} /> Select a payment method</>}
                </button>
                <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Shield size={11} /> Your payment is protected by TrustTrade Escrow
                </p>
              </div>
            )}

            {/* Seller awaiting payment */}
            {isAwaitingBuyerPayment && (
              <div style={S.actionCard('#f59e0b', '#fffbeb')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={18} color="#d97706" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#78350f', margin: '0 0 4px' }}>Awaiting Buyer Payment</p>
                    <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 10px' }}>Escrow created. You'll be notified once payment is received.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#d97706' }}>
                      <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Waiting for buyer to pay…
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Seller start delivery */}
            {canStartDelivery && (
              <div style={S.actionCard('#8b5cf6', '#f5f3ff')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color="#7c3aed" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#3b0764', margin: '0 0 4px' }}>Funds Secured — Deliver Item</p>
                    <p style={{ fontSize: 13, color: '#6d28d9', margin: '0 0 14px' }}>Payment received and held securely. Deliver the item to the buyer and mark as dispatched.</p>
                    <button onClick={handleStartDelivery} disabled={startingDelivery} data-testid="start-delivery-btn" className="action-btn" style={{ ...S.btn('#8b5cf6'), opacity: startingDelivery ? 0.6 : 1 }}>
                      {startingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><Truck size={13} /> Mark as Dispatched</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual start delivery */}
            {!canStartDelivery && canManualStartDelivery && !transaction.delivery_started_at && (
              <div style={S.actionCard('#f59e0b', '#fffbeb')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color="#d97706" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#78350f', margin: '0 0 4px' }}>Mark as Dispatched</p>
                    <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 4px' }}>Payment appears received. Click to mark as dispatched.</p>
                    <p style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: 6, margin: '0 0 14px' }}><strong>Note:</strong> Use this if the normal flow isn't showing buttons correctly.</p>
                    <button onClick={handleManualStartDelivery} disabled={startingDelivery} data-testid="manual-start-delivery-btn" className="action-btn" style={{ ...S.btn('#f59e0b'), opacity: startingDelivery ? 0.6 : 1 }}>
                      {startingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><Truck size={13} /> Mark as Dispatched</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Buyer accept delivery */}
            {canAcceptDeliveryTS && (
              <div style={S.actionCard('#10b981', '#ecfdf5')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#059669" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#064e3b', margin: '0 0 4px' }}>Confirm Receipt</p>
                    <p style={{ fontSize: 13, color: '#059669', margin: '0 0 4px' }}>Seller has dispatched. Confirm when you've received the item.</p>
                    <p style={{ fontSize: 12, color: '#047857', background: '#d1fae5', padding: '6px 10px', borderRadius: 6, margin: '0 0 14px' }}><strong>Important:</strong> Only confirm if satisfied. This cannot be undone.</p>
                    {payoutReadiness && !payoutReadiness.payout_ready && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '0 0 3px' }}>Seller Payout Setup Incomplete</p>
                        <p style={{ fontSize: 12, color: '#b45309', margin: 0 }}>{payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup.'}</p>
                        {payoutReadiness.can_auto_sync && <p style={{ fontSize: 12, color: '#d97706', margin: '4px 0 0' }}>The system will attempt to sync automatically when you confirm.</p>}
                      </div>
                    )}
                    {checkingPayoutReadiness && <p style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Checking payout readiness…</p>}
                    <button onClick={handleAcceptDelivery} disabled={acceptingDelivery || checkingPayoutReadiness} data-testid="accept-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: (acceptingDelivery || checkingPayoutReadiness) ? 0.6 : 1 }}>
                      {acceptingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><CheckCircle2 size={13} /> Confirm Receipt & Release Funds</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual accept delivery */}
            {!canAcceptDeliveryTS && canManualAcceptDelivery && !transaction.delivery_confirmed && (
              <div style={S.actionCard('#10b981', '#ecfdf5')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: '#a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#059669" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#064e3b', margin: '0 0 4px' }}>Confirm Receipt</p>
                    <p style={{ fontSize: 13, color: '#059669', margin: '0 0 14px' }}>Confirm delivery to release funds to the seller.</p>
                    {payoutReadiness && !payoutReadiness.payout_ready && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 12, color: '#b45309', margin: 0 }}>{payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup.'}</p>
                      </div>
                    )}
                    <button onClick={handleManualAcceptDelivery} disabled={acceptingDelivery || checkingPayoutReadiness} data-testid="manual-accept-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: (acceptingDelivery || checkingPayoutReadiness) ? 0.6 : 1 }}>
                      {acceptingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><CheckCircle2 size={13} /> Confirm Receipt & Release Funds</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy status hints */}
            {!hasEscrow && sellerConfirmed && transaction.payment_status === 'Ready for Payment' && (
              <div style={S.actionCard('#3b82f6', '#eff6ff')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1e3a5f', margin: '0 0 4px' }}>Awaiting Payment</p>
                <p style={{ fontSize: 13, color: '#3b82f6', margin: 0 }}>{isBuyer ? 'Make payment to the escrow account.' : 'Waiting for buyer payment.'}</p>
              </div>
            )}
            {!hasEscrow && transaction.payment_status === 'Paid' && !transaction.delivery_confirmed && (
              <div style={S.actionCard('#f59e0b', '#fffbeb')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#78350f', margin: '0 0 4px' }}>Payment Received — Awaiting Delivery</p>
                <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>{isSeller ? 'Deliver the item. Funds released after buyer confirms.' : 'Payment held in escrow. Confirm delivery once received.'}</p>
              </div>
            )}

            {/* Tabs */}
            <div style={S.card}>
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 8px' }}>
                {['overview', 'agreement', 'timeline', 'photos'].map(tab => (
                  <button key={tab} className={`td-tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ padding: '20px 22px' }}>
                {/* Overview tab */}
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {[
                        { title: 'Buyer', icon: User, color: '#3b82f6', bg: '#eff6ff', name: transaction.buyer_name, email: transaction.buyer_email, phone: transaction.buyer_phone, confirmed: buyerConfirmed },
                        { title: 'Seller', icon: User, color: '#f97316', bg: '#fff7ed', name: transaction.seller_name, email: transaction.seller_email, phone: transaction.seller_phone, confirmed: sellerConfirmed },
                      ].map(p => (
                        <div key={p.title} style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <p.icon size={13} color={p.color} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.title}</span>
                            {p.confirmed && <CheckCircle2 size={13} color="#10b981" style={{ marginLeft: 'auto' }} />}
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>{p.name}</p>
                          {p.email && <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{p.email}</p>}
                          {p.phone && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', fontFamily: 'monospace' }}>{p.phone}</p>}
                          {transaction.invite_type === 'phone' && !p.email && !p.phone && <p style={{ fontSize: 12, color: '#3b82f6', margin: '2px 0 0' }}>Invited via phone</p>}
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Item Details</p>
                      <p style={{ fontSize: 14, color: '#374151', margin: '0 0 10px', lineHeight: 1.6 }}>{transaction.item_description}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {transaction.item_condition && <span style={S.pill('#f1f5f9', '#475569')}>{transaction.item_condition}</span>}
                        {transaction.delivery_method && (
                          <span style={S.pill('#eff6ff', '#2563eb')}>
                            {transaction.delivery_method === 'courier' ? 'Courier' : transaction.delivery_method === 'bank_deposit' ? 'Bank Deposit' : 'Digital'}
                          </span>
                        )}
                      </div>
                      {transaction.known_issues && transaction.known_issues !== 'None' && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                          <p style={{ ...S.label, marginBottom: 4 }}>Known Issues</p>
                          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{transaction.known_issues}</p>
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Price Summary</p>
                      {[
                        { label: 'Item Price', value: `R ${transaction.item_price.toFixed(2)}`, mono: true },
                        { label: 'TrustTrade Fee (2%)', value: `R ${transaction.trusttrade_fee.toFixed(2)}`, mono: true },
                        { label: 'Fee Paid By', value: getFeePayerLabel(transaction.fee_allocation), badge: true, testId: 'fee-payer-badge' },
                      ].map(r => (
                        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: 13, color: '#64748b' }}>{r.label}</span>
                          {r.badge ? <span data-testid={r.testId} style={S.pill('#eff6ff', '#2563eb')}>{r.value}</span> : <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', fontFamily: r.mono ? 'monospace' : 'inherit' }}>{r.value}</span>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Total Secure Payment</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>R {totalSecurePayment.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Agreement tab */}
                {activeTab === 'agreement' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 14 }}>Escrow Agreement</p>
                    {sellerConfirmed ? (
                      <div>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>The escrow agreement has been generated and is available for download.</p>
                        <button onClick={handleDownloadPDF} data-testid="download-agreement-btn" style={{ ...S.btn('#0f1729'), display: 'inline-flex' }}>
                          <Download size={13} /> Download Agreement (PDF)
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>Agreement will be available once the seller confirms the transaction details.</p>
                    )}
                  </div>
                )}

                {/* Timeline tab */}
                {activeTab === 'timeline' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 20 }}>Transaction Progress</p>
                    <TransactionTimeline transaction={transaction} currentState={transaction.transaction_state || mapPaymentStatusToState(transaction.payment_status, transaction.tradesafe_state)} timeline={transaction.timeline} />
                    {transaction.transaction_state === 'DELIVERED' && (
                      <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 8, backgroundColor: 'rgba(26,115,232,0.08)' }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#1a73e8', fontWeight: 500 }}>
                          Funds released when buyer confirms receipt
                        </p>
                      </div>
                    )}
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Event History</p>
                      <Timeline transaction={transaction} />
                    </div>
                  </div>
                )}

                {/* Photos tab */}
                {activeTab === 'photos' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 16 }}>Item Photos</p>
                    {transaction.item_photos && transaction.item_photos.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                        {transaction.item_photos.map((photo, index) => {
                          const photoUrl = photo.startsWith('http') ? photo : `${BASE_URL}/uploads/photos/${photo}`;
                          return (
                            <div key={index} onClick={() => window.open(photoUrl, '_blank')} style={{ borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative', aspectRatio: '1', background: '#f1f5f9' }}>
                              <img src={photoUrl} alt={`Photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23f1f5f9" width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="14">No Image</text></svg>'; }} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <ImageIcon size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
                        <p style={{ fontSize: 14, color: '#94a3b8' }}>No photos uploaded</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Legacy confirm delivery */}
            {canConfirmDelivery && (
              <div style={S.actionCard('#10b981', '#ecfdf5')}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#064e3b', margin: '0 0 6px' }}>Final Step: Confirm Delivery</p>
                <p style={{ fontSize: 13, color: '#059669', margin: '0 0 14px' }}>Have you received the item and are satisfied? Confirming releases funds to the seller. This cannot be undone.</p>
                <button onClick={handleConfirmDelivery} disabled={confirming} data-testid="confirm-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: confirming ? 0.6 : 1 }}>
                  {confirming ? 'Processing…' : 'Confirm Delivery & Release Funds'}
                </button>
              </div>
            )}

            {/* Delivery confirmed banner */}
            {transaction.delivery_confirmed && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <CheckCircle2 size={28} color="#10b981" />
                <div><p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', margin: 0 }}>Delivery Confirmed</p><p style={{ fontSize: 13, color: '#059669', margin: 0 }}>Funds have been released to the seller</p></div>
              </div>
            )}

            {/* Rating */}
            {transaction.delivery_confirmed && (
              <div style={{ ...S.card, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Star size={16} color="#fbbf24" fill="#fbbf24" />
                  <p style={S.sectionTitle}>Rate This Transaction</p>
                </div>
                {isBuyer && transaction.buyer_rating ? (
                  <div><p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Your rating for the seller:</p><StarRating value={transaction.buyer_rating} readOnly size="w-6 h-6" />{transaction.buyer_review && <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>"{transaction.buyer_review}"</p>}</div>
                ) : isSeller && transaction.seller_rating ? (
                  <div><p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Your rating for the buyer:</p><StarRating value={transaction.seller_rating} readOnly size="w-6 h-6" />{transaction.seller_review && <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>"{transaction.seller_review}"</p>}</div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{isBuyer ? 'Rate your experience with the seller:' : 'Rate your experience with the buyer:'}</p>
                    <div style={{ marginBottom: 14 }}><StarRating value={rating} onSelect={setRating} onHover={setHoverRating} /></div>
                    <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>Review (optional)</label>
                    <Textarea placeholder="Share your experience…" value={review} onChange={(e) => setReview(e.target.value)} rows={3} data-testid="review-textarea" style={{ marginBottom: 12 }} />
                    <button onClick={handleSubmitRating} disabled={submittingRating || rating === 0} data-testid="submit-rating-btn" className="action-btn" style={{ ...S.btn('#0f1729'), opacity: (submittingRating || rating === 0) ? 0.5 : 1 }}>
                      {submittingRating ? 'Submitting…' : 'Submit Rating'}
                    </button>
                  </div>
                )}
                {isBuyer && transaction.seller_rating && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}><p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Seller's rating for you:</p><StarRating value={transaction.seller_rating} readOnly size="w-5 h-5" />{transaction.seller_review && <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 6 }}>"{transaction.seller_review}"</p>}</div>}
                {isSeller && transaction.buyer_rating && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}><p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Buyer's rating for you:</p><StarRating value={transaction.buyer_rating} readOnly size="w-5 h-5" />{transaction.buyer_review && <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 6 }}>"{transaction.buyer_review}"</p>}</div>}
              </div>
            )}

            {/* Raise dispute */}
            {!transaction.delivery_confirmed && sellerConfirmed && (
              <div style={{ ...S.card, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Having issues with this transaction?</p>
                <button onClick={() => navigate('/disputes-dashboard', { state: { transactionId: transaction.transaction_id } })} style={{ ...S.btnOutline, fontSize: 12 }}>
                  <FileText size={12} /> Raise Dispute
                </button>
              </div>
            )}
          </div>
          {/* END left column */}

          {/* ── Sticky sidebar ──────────────────────────── */}
          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Deal summary */}
            <div style={{ ...S.card, padding: '18px 20px' }}>
              <p style={{ ...S.label, marginBottom: 14 }}>Deal Summary</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{transaction.item_description}</p>
              {transaction.item_condition && <span style={{ ...S.pill('#f1f5f9', '#64748b'), fontSize: 10, marginBottom: 14, display: 'inline-block' }}>{transaction.item_condition}</span>}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 12 }}>
                {[
                  { label: 'Price', value: `R ${transaction.item_price.toFixed(2)}` },
                  { label: 'TrustTrade Fee', value: `R ${transaction.trusttrade_fee.toFixed(2)}`, color: '#64748b' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#94a3b8' }}>{r.label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 500, color: r.color || '#0f172a' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Seller Receives</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>R {(transaction.seller_receives ?? (transaction.item_price - transaction.trusttrade_fee))?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Share link */}
            {shareLink && (
              <div style={{ ...S.card, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Share Code</span>
                  <Share2 size={12} color="#94a3b8" />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6', background: '#f8fafc', padding: '6px 10px', borderRadius: 7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{transaction.share_code}</code>
                  <button onClick={handleCopyLink} data-testid="copy-share-link-btn" style={{ ...S.btnOutline, padding: '6px 10px', flexShrink: 0 }}>
                    {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`I've created a secure TrustTrade escrow for you. Click the link to view and confirm the transaction: ${shareLink}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: '#25D366', color: 'white', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 4, textDecoration: 'none', flexShrink: 0 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            )}

            {/* Parties */}
            <div style={{ ...S.card, padding: '14px 16px' }}>
              <p style={{ ...S.label, marginBottom: 12 }}>Parties</p>
              {[
                { name: transaction.buyer_name, role: 'Buyer', phone: transaction.buyer_phone, confirmed: buyerConfirmed, color: '#3b82f6', bg: '#eff6ff' },
                { name: transaction.seller_name, role: 'Seller', phone: transaction.seller_phone, confirmed: sellerConfirmed, color: '#f97316', bg: '#fff7ed' },
              ].map((p, i) => (
                <div key={p.role} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i === 0 ? 10 : 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} color={p.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{p.role}{p.phone && ' · via phone'}</p>
                  </div>
                  {p.confirmed && <CheckCircle2 size={14} color="#10b981" />}
                </div>
              ))}
            </div>

            {/* Refresh */}
            <button onClick={handleSyncStatus} disabled={syncing} data-testid="refresh-transaction-btn" style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>
              {syncing ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Syncing…</> : <><RefreshCw size={13} /> Refresh Status</>}
            </button>

            {/* Escrow badge */}
            {hasEscrow && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Shield size={13} color="#059669" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>Escrow Active</span>
                </div>
                <p style={{ fontSize: 11, color: '#059669', fontFamily: 'monospace', margin: '0 0 8px' }}>Ref: {transaction.tradesafe_id?.slice(0, 14)}…</p>
                <span style={{ ...S.pill(getEscrowStateBadge(escrowState).bg, getEscrowStateBadge(escrowState).text), fontSize: 11 }}>
                  {getEscrowStateBadge(escrowState).label}
                </span>
              </div>
            )}
          </div>
          {/* END sidebar */}

        </div>
      </div>
    </DashboardLayout>
  );
}

export default TransactionDetail;
