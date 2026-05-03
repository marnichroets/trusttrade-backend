import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Timeline from '../components/Timeline';
import { TransactionTimeline, AutoReleaseCountdown } from '../components/TransactionTimeline';
import TransactionStatusCard from '../components/TransactionStatusCard';
import StepProgressTracker from '../components/StepProgressTracker';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import api from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, FileText, User, Mail, Calendar, Package, Download, CheckCircle2, Image as ImageIcon, Star, Copy, Share2, Check, AlertTriangle, CreditCard, Truck, ExternalLink, Shield, Loader2, Phone, Lock, RefreshCw, Clock, Banknote } from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://trusttrade-backend-production-3efa.up.railway.app';
const API = BASE_URL ? `${BASE_URL}/api` : '/api';

function parseErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (!detail) return 'An error occurred';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return 'An error occurred';
}

function TransactionDetail() {
  const API_BASE = process.env.REACT_APP_API_URL || '';
  const BASE_URL = API_BASE.replace('/api', '');
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
  // Escrow states
  const [creatingEscrow, setCreatingEscrow] = useState(false);
  const [loadingPaymentLink, setLoadingPaymentLink] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [acceptingDelivery, setAcceptingDelivery] = useState(false);
  // Payout readiness state
  const [payoutReadiness, setPayoutReadiness] = useState(null);
  const [checkingPayoutReadiness, setCheckingPayoutReadiness] = useState(false);
  // Payment method selection
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  // Phone verification states
  const [needsPhoneVerification, setNeedsPhoneVerification] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState(null);
  // OTP security states
  const [remainingOtpRequests, setRemainingOtpRequests] = useState(3);
  const [remainingVerifyAttempts, setRemainingVerifyAttempts] = useState(5);
  const [otpExpiresIn, setOtpExpiresIn] = useState(10);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);
  // Sync status state
  const [syncing, setSyncing] = useState(false);
  // Wrong account state
  const [wrongAccount, setWrongAccount] = useState(null);
  const navigate = useNavigate();
  const { transactionId } = useParams();

  useEffect(() => {
    fetchData();
  }, [transactionId]);

  // Check payout readiness when transaction is in delivery state and user is buyer
  useEffect(() => {
    if (!transaction || !user) return;
    
    const isBuyerUser = transaction.buyer_email === user.email || transaction.buyer_user_id === user.user_id;
    const escrowState = transaction.tradesafe_state;
    const hasEscrow = !!transaction.tradesafe_id;
    const canRelease = hasEscrow && isBuyerUser && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState);
    
    if (canRelease && !payoutReadiness) {
      checkPayoutReadiness();
    }
  }, [transaction, user]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Auto-refresh every 8 seconds when transaction is in active state
  useEffect(() => {
    if (!transaction) return;
    
    // States that need auto-refresh (awaiting external actions)
    const activeStates = [
      'Awaiting Payment',
      'Pending Seller Confirmation',
      'Pending Buyer Confirmation',
      'Ready for Payment',
      'Funds Secured',
      'Delivery in Progress',
      'Awaiting Release'
    ];
    
    const shouldAutoRefresh = activeStates.includes(transaction.payment_status);
    
    if (shouldAutoRefresh) {
      const interval = setInterval(() => {
        console.log('[AUTO-REFRESH] Refreshing transaction status...');
        fetchData();
      }, 8000); // 8 seconds
      
      return () => clearInterval(interval);
    }
  }, [transaction?.payment_status, transactionId]);

  // State for phone verification context from backend
  const [phoneVerificationContext, setPhoneVerificationContext] = useState(null);

  const fetchData = async () => {
    try {
      // First get user info
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
      
      // Pre-fill phone if user has one
      if (userRes.data.phone) {
        setPhoneNumber(userRes.data.phone);
      }
      
      // Then try to get transaction
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data);
      setNeedsPhoneVerification(false);
      setPhoneVerificationContext(null);
    } catch (error) {
      console.error('Failed to confirm:', error);
      const msg = parseErrorMessage(error) || '';
      if (msg.startsWith('MISSING_PROFILE:')) {
        setProfileIncompleteError(msg.replace('MISSING_PROFILE:', '').trim());
      } else {
        toast.error(msg || 'Failed to confirm transaction');
      }
    } finally {
      setSellerConfirming(false);
    }
      const msg = parseErrorMessage(error) || '';
      if (msg.startsWith('MISSING_PROFILE:')) {
        setProfileIncompleteError(msg.replace('MISSING_PROFILE:', '').trim());
      } else {
        toast.error(msg || 'Failed to confirm transaction');
      }
    } finally {
      
      const errorDetail = error.response?.data?.detail;
      const errorStatus = error.response?.status;
      
      // Check if it's a structured phone verification required error
      if (errorStatus === 403 && typeof errorDetail === 'object' && errorDetail?.type === 'phone_verification_required') {
        // Phone verification needed - show inline verification
        console.log('[PHONE_VERIFY] Phone verification required:', errorDetail);
        setNeedsPhoneVerification(true);
        setPhoneVerificationContext({
          maskedPhone: errorDetail.invited_phone_masked,
          inviteType: errorDetail.invite_type,
          itemDescription: errorDetail.item_description,
          itemPrice: errorDetail.item_price,
          message: errorDetail.message
        });
        setVerificationError(errorDetail.message);
        
        // Still try to get user info for pre-filling
        try {
          const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
          setUser(userRes.data);
          if (userRes.data.phone) {
            setPhoneNumber(userRes.data.phone);
          }
        } catch (e) {
          console.error('Failed to get user:', e);
        }
      } else if (errorStatus === 403 && (typeof errorDetail === 'string' && (errorDetail.includes('phone') || errorDetail.includes('Phone')))) {
        // Legacy string-based phone verification error
        setNeedsPhoneVerification(true);
        setVerificationError(errorDetail);
        
        try {
          const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
          setUser(userRes.data);
          if (userRes.data.phone) {
            setPhoneNumber(userRes.data.phone);
          }
        } catch (e) {
          console.error('Failed to get user:', e);
        }
      } else if (errorStatus === 403) {
        // Wrong account or other access denied
        const errorMsg = typeof errorDetail === 'string' ? errorDetail : (errorDetail?.message || 'Access denied');
        const match = errorMsg.match(/sent to (?:email address |phone number )?([^\s.]+)/i);
        const expectedEmail = match ? match[1] : 'the invited account';
        
        try {
          const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
          setUser(userRes.data);
          setWrongAccount({
            expected: expectedEmail,
            current: userRes.data.email,
            message: errorMsg
          });
        } catch (e) {
          console.error('Failed to get user:', e);
          setWrongAccount({
            expected: expectedEmail,
            current: 'current account',
            message: errorMsg
          });
        }
      } else {
        toast.error('Transaction not found');
        navigate('/transactions');
      }
    } finally {
      setLoading(false);
    }
  };

  // Validate phone number against masked format
  const validatePhoneAgainstMask = (enteredPhone, maskedPhone) => {
    if (!maskedPhone) return true; // No mask to validate against
    
    // Normalize entered phone - remove spaces, dashes, plus sign
    let normalized = enteredPhone.replace(/[\s\-\+]/g, '');
    // Remove leading 0 or 27
    if (normalized.startsWith('0')) normalized = normalized.slice(1);
    if (normalized.startsWith('27')) normalized = normalized.slice(2);
    
    if (normalized.length < 9) return false;
    
    // Extract last 4 digits from masked phone (pattern: +27•••2758 or similar)
    const match = maskedPhone.match(/(\d{4})$/);
    if (match) {
      const expectedLast4 = match[1];
      return normalized.endsWith(expectedLast4);
    }
    return true;
  };

  // Send OTP for phone verification with validation
  const handleSendOtp = async () => {
    // Clear previous errors
    setVerificationError(null);
    
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    // Check if locked out
    if (isLockedOut) {
      toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`);
      return;
    }

    // Validate phone against expected masked format
    const maskedPhone = phoneVerificationContext?.maskedPhone;
    if (maskedPhone && !validatePhoneAgainstMask(phoneNumber, maskedPhone)) {
      setVerificationError(`Phone number doesn't match the expected format. The number should end with ${maskedPhone.slice(-4)}.`);
      toast.error(`Phone number doesn't match. Expected ending: ${maskedPhone.slice(-4)}`);
      return;
    }

    setSendingOtp(true);
    try {
      const response = await api.post(
        `${API}/verification/phone/send-otp`,
        { 
          phone_number: phoneNumber,
          expected_phone_masked: maskedPhone || null
        },
        { withCredentials: true }
      );
      
      setOtpSent(true);
      setResendCooldown(response.data.cooldown_seconds || 60);
      setRemainingOtpRequests(response.data.remaining_requests ?? 2);
      setOtpExpiresIn(response.data.expires_in_minutes || 10);
      setRemainingVerifyAttempts(5); // Reset verify attempts for new OTP
      toast.success(`Verification code sent! Expires in ${response.data.expires_in_minutes || 10} minutes.`);
    } catch (error) {
      console.error('Failed to send OTP:', error);
      const errorDetail = error.response?.data?.detail || 'Failed to send verification code';
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        // Rate limited or locked out
        if (errorDetail.includes('locked') || errorDetail.includes('Too many failed')) {
          setIsLockedOut(true);
          const minutes = errorDetail.match(/(\d+) minutes/);
          setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30);
        }
        toast.error(errorDetail);
      } else if (errorDetail.includes("doesn't match")) {
        setVerificationError(errorDetail);
        toast.error('Phone number mismatch');
      } else {
        toast.error(errorDetail);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP and join transaction
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    // Check if locked out
    if (isLockedOut) {
      toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`);
      return;
    }

    setVerifyingOtp(true);
    setVerificationError(null);
    
    try {
      // First verify the OTP
      await api.post(
        `${API}/verification/phone/verify-otp`,
        { phone_number: phoneNumber, otp: otpCode },
        { withCredentials: true }
      );
      
      toast.success('Phone verified successfully!');
      
      // Now try to fetch the transaction again - should work now
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data);
      setNeedsPhoneVerification(false);
      setVerificationError(null);
      setIsLockedOut(false);
      
      // Update user state with verified phone
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
      
      toast.success('You have joined the transaction!');
    } catch (error) {
      console.error('Failed to verify OTP:', error);
      const errorDetail = error.response?.data?.detail || 'Verification failed';
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        // Rate limited or locked out
        setIsLockedOut(true);
        const minutes = errorDetail.match(/(\d+) minutes/);
        setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30);
        setVerificationError(errorDetail);
        toast.error(errorDetail);
      } else if (errorDetail.includes('expired')) {
        // OTP expired - need to request new one
        setOtpSent(false);
        setOtpCode('');
        setVerificationError('Verification code expired. Please request a new code.');
        toast.error('Code expired. Request a new one.');
      } else if (errorDetail.includes('attempts remaining')) {
        // Failed attempt with remaining tries
        const remaining = errorDetail.match(/(\d+) attempts/);
        if (remaining) setRemainingVerifyAttempts(parseInt(remaining[1]));
        setVerificationError(errorDetail);
        toast.error(errorDetail);
      } else if (errorDetail.includes('No verification code')) {
        // No OTP found
        setOtpSent(false);
        setOtpCode('');
        toast.error('Please request a new verification code.');
      } else if (errorDetail.includes('different') || errorDetail.includes('does not match')) {
        // Phone doesn't match transaction
        setVerificationError(errorDetail);
        toast.error('This transaction was sent to a different phone number');
      } else {
        setVerificationError(errorDetail);
        toast.error(errorDetail);
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSellerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details? This will enable the next step in the escrow process.')) {
      return;
    }

    setSellerConfirming(true);
    try {
      await api.post(
        `${API}/transactions/${transactionId}/seller-confirm`,
        { confirmed: true },
        { withCredentials: true }
      );

      toast.success('Transaction confirmed! Waiting for buyer to confirm.');
      fetchData();
    } catch (error) {
      console.error('Failed to confirm:', error);
      toast.error(parseErrorMessage(error) || 'Failed to confirm transaction');
    } finally {
      setSellerConfirming(false);
    }
  };

  const handleBuyerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details? This will enable the payment step once the seller also confirms.')) {
      return;
    }

    setConfirming(true);
    try {
      await api.post(
        `${API}/transactions/${transactionId}/buyer-confirm`,
        { confirmed: true },
        { withCredentials: true }
      );

      toast.success('Transaction confirmed! Waiting for seller to confirm.');
      fetchData();
    } catch (error) {
      console.error('Failed to confirm:', error);
      toast.error(parseErrorMessage(error) || 'Failed to confirm transaction');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!window.confirm('Are you sure you want to confirm delivery and release the funds to the seller?')) {
      return;
    }

    setConfirming(true);
    try {
      await api.patch(
        `${API}/transactions/${transactionId}/delivery`,
        { delivery_confirmed: true },
        { withCredentials: true }
      );

      toast.success('Delivery confirmed and funds released!');
      fetchData();
    } catch (error) {
      console.error('Failed to confirm delivery:', error);
      toast.error(parseErrorMessage(error) || 'Failed to confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(
        `${API}/transactions/${transactionId}/agreement-pdf`,
        { withCredentials: true, responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TrustTrade_Agreement_${transactionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Agreement downloaded');
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Agreement not available yet');
    }
  };

  // Sync status with TradeSafe (manual refresh)
  const handleSyncStatus = async () => {
    if (!transaction.tradesafe_id) {
      toast.info('No escrow linked to sync');
      fetchData();
      return;
    }

    setSyncing(true);
    console.log('[SYNC] Starting TradeSafe sync for', transactionId);
    
    try {
      const response = await api.post(
        `${API}/tradesafe/sync/${transactionId}`,
        {},
        { withCredentials: true }
      );

      console.log('[SYNC] Response:', response.data);
      
      if (response.data.state_changed) {
        toast.success(`Status updated: ${response.data.new_payment_status}`);
      } else {
        toast.info('Status is up to date');
      }
      
      // Refresh local data
      fetchData();
    } catch (error) {
      console.error('[SYNC] Failed:', error);
      toast.error(parseErrorMessage(error) || 'Failed to sync status');
      // Still refresh local data
      fetchData();
    } finally {
      setSyncing(false);
    }
  };

  // Create escrow transaction
  const handleCreateEscrow = async (e) => {
    // Prevent default and stop propagation for mobile
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('Create Escrow button clicked');
    console.log('[ESCROW] create start - transaction_id:', transactionId);
    console.log('[ESCROW] fee_allocation from transaction:', transaction.fee_allocation);
    
    if (!window.confirm('This will create a secure TrustTrade escrow. The buyer will then need to make payment. Proceed?')) {
      return;
    }

    setCreatingEscrow(true);
    toast.info('Creating escrow...');
    
    const payload = { 
      transaction_id: transactionId,
      fee_allocation: transaction.fee_allocation || 'SELLER_AGENT'
    };
    console.log('[ESCROW] payload:', payload);
    
    try {
      const response = await api.post(
        `${API}/tradesafe/create-transaction`,
        payload,
        { withCredentials: true }
      );

      console.log('[ESCROW] success - TradeSafe response:', response.data);
      toast.success('TrustTrade escrow created! Buyer can now make payment.');
      fetchData();
    } catch (error) {
      console.error('[ESCROW] failure:', error);
      const errorDetail = error.response?.data?.detail;
      const errorMessage = errorDetail || parseErrorMessage(error) || 'Failed to create escrow. Please try again.';
      console.log('[ESCROW] failure exact reason:', errorMessage);
      toast.error(errorMessage);
      alert('Error: ' + errorMessage); // Fallback alert for mobile
    } finally {
      setCreatingEscrow(false);
    }
  };

  // Get payment link for buyer
  const handleGetPaymentLink = async (e) => {
    // Prevent default and stop propagation for mobile
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!selectedPaymentMethod) {
      toast.error('Please select a payment method first');
      return;
    }
    
    console.log('Pay button clicked with method:', selectedPaymentMethod);
    
    setLoadingPaymentLink(true);
    toast.info('Loading payment page...');
    
    try {
      console.log('Calling payment-url API with method:', selectedPaymentMethod);
      const response = await api.get(
        `${API}/tradesafe/payment-url/${transactionId}?payment_method=${selectedPaymentMethod}`,
        { withCredentials: true }
      );

      console.log('Payment URL response:', response.data);
      setPaymentInfo(response.data);
      
      // Check if transaction is already paid
      if (response.data.already_paid) {
        console.log('Transaction already paid:', response.data.state);
        toast.success('This transaction has already been paid.');
        // Update local transaction state to reflect payment
        setTransaction(prev => ({
          ...prev,
          tradesafe_state: response.data.state,
          status: 'paid'
        }));
        return;
      }
      
      if (response.data.payment_link) {
        // Open payment link in new tab
        const paymentLink = response.data.payment_link;
        console.log('Opening payment link:', paymentLink);
        
        // Try window.open first, fallback to location.href for mobile
        const newWindow = window.open(paymentLink, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Popup blocked or mobile - use direct navigation
          console.log('Popup blocked, using direct navigation');
          window.location.href = paymentLink;
        }
        
        toast.success('Secure payment page opened. Complete your payment.');
      } else {
        // No payment link - show EFT bank details message
        setPaymentInfo(response.data);
        toast.info('Payment deposit created. For EFT payment, please use the bank details provided. In production, you will be redirected to the payment page.');
      }
    } catch (error) {
      console.error('Failed to get payment link:', error);
      const errorMessage = error.response?.data?.detail || 'Payment processing error. Please try again.';
      toast.error(errorMessage);
      alert('Error: ' + errorMessage); // Fallback alert for mobile
    } finally {
      setLoadingPaymentLink(false);
    }
  };

  // Seller starts delivery
  const handleStartDelivery = async () => {
    if (!window.confirm('Mark this item as dispatched/delivered? The buyer will be notified.')) {
      return;
    }

    setStartingDelivery(true);
    try {
      await api.post(
        `${API}/tradesafe/start-delivery/${transactionId}`,
        {},
        { withCredentials: true }
      );

      toast.success('Delivery started! Buyer has been notified.');
      fetchData();
    } catch (error) {
      console.error('Failed to start delivery:', error);
      toast.error(parseErrorMessage(error) || 'Failed to start delivery. Please try again.');
    } finally {
      setStartingDelivery(false);
    }
  };

  // Manual override for start delivery (when webhook fails)
  const handleManualStartDelivery = async () => {
    if (!window.confirm('MANUAL OVERRIDE: Mark as dispatched? Use this if the normal button fails due to webhook issues.')) {
      return;
    }

    setStartingDelivery(true);
    try {
      await api.post(
        `${API}/tradesafe/manual-start-delivery/${transactionId}`,
        {},
        { withCredentials: true }
      );

      toast.success('Delivery manually started! Buyer notified.');
      fetchData();
    } catch (error) {
      console.error('Failed manual start delivery:', error);
      toast.error(parseErrorMessage(error) || 'Failed to start delivery.');
    } finally {
      setStartingDelivery(false);
    }
  };

  // Check payout readiness before showing release button
  const checkPayoutReadiness = async () => {
    if (!transactionId) return;
    
    setCheckingPayoutReadiness(true);
    try {
      const response = await api.get(
        `${API}/tradesafe/payout-readiness/${transactionId}`,
        { withCredentials: true }
      );
      setPayoutReadiness(response.data);
      
      if (!response.data.payout_ready) {
        console.warn('[PAYOUT] Not ready:', response.data.issues);
      }
    } catch (error) {
      console.error('Failed to check payout readiness:', error);
      // Don't block UI, just set to unknown state
      setPayoutReadiness({ payout_ready: null, issues: ['Could not verify payout readiness'] });
    } finally {
      setCheckingPayoutReadiness(false);
    }
  };

  // Buyer accepts delivery - with payout readiness pre-check
  const handleAcceptDelivery = async () => {
  // Pre-check payout readiness
    if (!payoutReadiness?.payout_ready) {
     // Refresh the check
      await checkPayoutReadiness();

      if (!payoutReadiness?.payout_ready) {
        const issues = payoutReadiness?.issues?.join(', ') || 'Unknown issue';
        toast.warning(`Seller payout setup incomplete. Attempting automatic sync on release. Current issues: ${issues}`);
    }
  }
    
    if (!window.confirm('Confirm you have received the item? This will release funds to the seller. This action cannot be undone.')) {
      return;
    }

    setAcceptingDelivery(true);
    try {
      const response = await api.post(
        `${API}/tradesafe/accept-delivery/${transactionId}`,
        {},
        { withCredentials: true }
      );

      toast.success(`Delivery confirmed! R${response.data.net_amount?.toFixed(2) || ''} released to seller.`);
      fetchData();
    } catch (error) {
      console.error('Failed to accept delivery:', error);
      toast.error(parseErrorMessage(error) || 'Failed to confirm delivery. Please try again.');
    } finally {
      setAcceptingDelivery(false);
    }
  };

  // Manual override for accept delivery (when webhook fails)
  const handleManualAcceptDelivery = async () => {
    if (!window.confirm('MANUAL OVERRIDE: Confirm receipt and release funds? Use this if the normal button fails.')) {
      return;
    }

    setAcceptingDelivery(true);
    try {
      const response = await api.post(
        `${API}/tradesafe/manual-accept-delivery/${transactionId}`,
        {},
        { withCredentials: true }
      );

      toast.success(`Delivery confirmed! R${response.data.net_amount?.toFixed(2) || ''} released to seller.`);
      fetchData();
    } catch (error) {
      console.error('Failed manual accept delivery:', error);
      toast.error(parseErrorMessage(error) || 'Failed to confirm delivery.');
    } finally {
      setAcceptingDelivery(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setSubmittingRating(true);
    try {
      await api.post(
        `${API}/transactions/${transactionId}/rate`,
        { rating, review: review.trim() || null },
        { withCredentials: true }
      );

      toast.success('Rating submitted successfully!');
      fetchData();
    } catch (error) {
      console.error('Failed to submit rating:', error);
      toast.error(parseErrorMessage(error) || 'Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  };

  const StarRating = ({ value, onSelect, onHover, readOnly = false, size = 'w-8 h-8' }) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onSelect && onSelect(star)}
            onMouseEnter={() => !readOnly && onHover && onHover(star)}
            onMouseLeave={() => !readOnly && onHover && onHover(0)}
            className={`${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
            data-testid={`star-${star}`}
          >
            <Star
              className={`${size} ${
                star <= (readOnly ? value : (onHover ? hoverRating || value : value))
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-slate-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Pending Seller Confirmation': 'bg-orange-100 text-orange-800',
      'Pending Buyer Confirmation': 'bg-orange-100 text-orange-800',
      'Ready for Payment': 'bg-blue-100 text-blue-800',
      'Awaiting Payment': 'bg-blue-100 text-blue-800',
      'Funds Secured': 'bg-emerald-100 text-emerald-800',
      'Delivery in Progress': 'bg-purple-100 text-purple-800',
      'Awaiting Buyer Confirmation': 'bg-amber-100 text-amber-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  const getEscrowStateBadge = (state) => {
    const variants = {
      'CREATED': { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Created' },
      'PENDING': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      'FUNDS_RECEIVED': { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Funds Secured' },
      'INITIATED': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Delivery Started' },
      'SENT': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Item Sent' },
      'DELIVERED': { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Awaiting Confirmation' },
      'FUNDS_RELEASED': { bg: 'bg-green-100', text: 'text-green-800', label: 'Funds Released' },
      'DISPUTED': { bg: 'bg-red-100', text: 'text-red-800', label: 'Disputed' },
      'CANCELLED': { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' }
    };
    return variants[state] || { bg: 'bg-slate-100', text: 'text-slate-600', label: state };
  };

  const getReleaseStatusBadge = (status) => {
    const variants = {
      'Not Released': 'bg-slate-100 text-slate-600',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  // Helper to map legacy payment status to new state machine
  const mapPaymentStatusToState = (paymentStatus, tradesafeState) => {
    const ps = (paymentStatus || '').toLowerCase();
    const ts = (tradesafeState || '').toUpperCase();
    
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Phone verification flow - show inline OTP verification when needed
  if (needsPhoneVerification) {
    return (
      <DashboardLayout user={user}>
        <div className="max-w-md mx-auto py-12 px-4">
          <Card className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Verify Your Phone Number</h1>
              <p className="text-slate-600">
                This transaction was sent to a phone number. Please verify your number to access it.
              </p>
            </div>

            {/* Transaction Preview Info */}
            {phoneVerificationContext && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <div className="space-y-2">
                  {phoneVerificationContext.itemDescription && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Item:</span>
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">
                        {phoneVerificationContext.itemDescription}
                      </span>
                    </div>
                  )}
                  {phoneVerificationContext.itemPrice > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Amount:</span>
                      <span className="text-sm font-semibold text-emerald-600">
                        R {phoneVerificationContext.itemPrice.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {phoneVerificationContext.maskedPhone && (
                    <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
                      <span className="text-xs text-slate-500">Sent to:</span>
                      <span className="text-sm font-mono font-medium text-blue-600">
                        {phoneVerificationContext.maskedPhone}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error message - enhanced for all error types */}
            {verificationError && (
              <div className={`border rounded-lg p-4 mb-6 ${
                verificationError.includes('locked') || verificationError.includes('Too many') 
                  ? 'bg-orange-50 border-orange-200' 
                  : verificationError.includes('expired')
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                    verificationError.includes('locked') || verificationError.includes('Too many')
                      ? 'text-orange-600'
                      : verificationError.includes('expired')
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`} />
                  <div>
                    <p className={`text-sm font-medium ${
                      verificationError.includes('locked') || verificationError.includes('Too many')
                        ? 'text-orange-800'
                        : verificationError.includes('expired')
                          ? 'text-amber-800'
                          : 'text-red-800'
                    }`}>
                      {verificationError.includes('locked') || verificationError.includes('Too many')
                        ? 'Too Many Attempts'
                        : verificationError.includes('expired')
                          ? 'Code Expired'
                          : verificationError.includes('mismatch') || verificationError.includes("doesn't match")
                            ? 'Phone Number Mismatch'
                            : verificationError.includes('attempts remaining')
                              ? 'Incorrect Code'
                              : 'Verification Error'}
                    </p>
                    <p className={`text-sm mt-1 ${
                      verificationError.includes('locked') || verificationError.includes('Too many')
                        ? 'text-orange-600'
                        : verificationError.includes('expired')
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}>{verificationError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lockout warning */}
            {isLockedOut && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Account Temporarily Locked</p>
                    <p className="text-sm text-red-600 mt-1">
                      Too many failed attempts. Please try again in {lockoutMinutes} minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!otpSent ? (
              // Step 1: Enter phone number
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="tel"
                      placeholder="+27 82 123 4567"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        // Clear mismatch error when user types
                        if (verificationError?.includes("doesn't match")) {
                          setVerificationError(null);
                        }
                      }}
                      className="pl-10"
                      data-testid="phone-input"
                      disabled={isLockedOut}
                    />
                  </div>
                  {phoneVerificationContext?.maskedPhone ? (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Enter the number matching: {phoneVerificationContext.maskedPhone}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the phone number this transaction was sent to
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleSendOtp}
                  disabled={sendingOtp || !phoneNumber || isLockedOut}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  data-testid="send-otp-btn"
                >
                  {sendingOtp ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : isLockedOut ? (
                    `Locked - Try again in ${lockoutMinutes}m`
                  ) : (
                    'Send Verification Code'
                  )}
                </Button>
                
                {/* Rate limit info */}
                {remainingOtpRequests < 3 && !isLockedOut && (
                  <p className="text-xs text-amber-600 text-center">
                    {remainingOtpRequests} code requests remaining in this window
                  </p>
                )}
              </div>
            ) : (
              // Step 2: Enter OTP
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <p className="text-sm text-emerald-800">
                        Code sent to <span className="font-medium">{phoneNumber}</span>
                      </p>
                    </div>
                    <span className="text-xs text-emerald-600 font-medium">
                      Expires in {otpExpiresIn}m
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Verification Code
                  </label>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      // Clear error when typing new code
                      if (verificationError?.includes('attempts remaining') || verificationError?.includes('Incorrect')) {
                        setVerificationError(null);
                      }
                    }}
                    className="text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                    data-testid="otp-input"
                    disabled={isLockedOut}
                  />
                  <p className="text-xs text-slate-500 mt-1 text-center">
                    Code expires in {otpExpiresIn} minutes
                  </p>
                  {remainingVerifyAttempts < 5 && (
                    <p className="text-xs text-amber-600 mt-1 text-center">
                      {remainingVerifyAttempts} attempts remaining
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleVerifyOtp}
                  disabled={verifyingOtp || otpCode.length !== 6 || isLockedOut}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="verify-otp-btn"
                >
                  {verifyingOtp ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : isLockedOut ? (
                    `Locked - Try again in ${lockoutMinutes}m`
                  ) : (
                    'Verify & Join Transaction'
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode('');
                      setVerificationError(null);
                    }}
                    className="text-slate-600 hover:text-slate-800"
                    disabled={isLockedOut}
                  >
                    Change number
                  </button>
                  
                  {resendCooldown > 0 ? (
                    <span className="text-slate-400">
                      Resend in {resendCooldown}s
                    </span>
                  ) : remainingOtpRequests > 0 && !isLockedOut ? (
                    <button
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Resend code ({remainingOtpRequests} left)
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">
                      No more requests available
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200">
              <Button
                variant="ghost"
                onClick={() => navigate('/transactions')}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Transactions
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Show wrong account UI
  if (wrongAccount) {
    const handleLogout = async () => {
      try {
        await api.post('/auth/logout', {}, { withCredentials: true });
        localStorage.removeItem('session_token');
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout failed:', error);
        window.location.href = '/login';
      }
    };

    return (
      <DashboardLayout user={user}>
        <div className="max-w-md mx-auto py-12 px-4">
          <Card className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Wrong Account</h1>
              <p className="text-slate-600">
                This transaction was sent to a different account.
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-3">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Transaction sent to:</p>
                <p className="font-medium text-slate-900">{wrongAccount.expected}</p>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">You are logged in as:</p>
                <p className="font-medium text-slate-900">{wrongAccount.current}</p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleLogout}
                className="w-full bg-[#1a2942] hover:bg-[#243751]"
              >
                Log Out and Switch Account
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/transactions')}
                className="w-full"
              >
                Continue as {wrongAccount.current?.split('@')[0]}
              </Button>
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              Log out and sign in with {wrongAccount.expected} to view this transaction.
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!transaction) {
    return null;
  }

  // Role detection with console logging for debugging
  const isBuyer = user?.user_id === transaction.buyer_user_id || 
    (user?.email && transaction.buyer_email && user.email.toLowerCase() === transaction.buyer_email.toLowerCase());
  const isSeller = user?.user_id === transaction.seller_user_id || 
    (user?.email && transaction.seller_email && user.email.toLowerCase() === transaction.seller_email.toLowerCase());
  
  // Debug logging
  console.log('Role Detection:', {
    userEmail: user?.email,
    userId: user?.user_id,
    buyerEmail: transaction.buyer_email,
    buyerUserId: transaction.buyer_user_id,
    sellerEmail: transaction.seller_email,
    sellerUserId: transaction.seller_user_id,
    isBuyer,
    isSeller
  });
  
  // Escrow flow conditions
  const hasEscrow = !!transaction.tradesafe_id;
  const escrowState = transaction.tradesafe_state;
  
  // Confirmation states
  const buyerConfirmed = transaction.buyer_confirmed;
  const sellerConfirmed = transaction.seller_confirmed;
  const bothConfirmed = buyerConfirmed && sellerConfirmed;
  
  // Can confirm: respective party hasn't confirmed yet
  const canBuyerConfirm = isBuyer && !buyerConfirmed;
  const canSellerConfirm = isSeller && !sellerConfirmed;
  
  // Can create escrow: both confirmed, no existing escrow, seller only
  const canCreateEscrow = isSeller && bothConfirmed && !hasEscrow && transaction.item_price >= 100;
  
  // Can make payment: escrow created, buyer ONLY, awaiting payment, BOTH confirmed
  // Check both escrowState (CREATED/PENDING) and payment_status (Awaiting Payment)
  const canMakePayment = hasEscrow && isBuyer && !isSeller && bothConfirmed &&
    (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  
  console.log('Payment Button Debug:', { hasEscrow, isBuyer, isSeller, escrowState, paymentStatus: transaction.payment_status, canMakePayment });
  
  // Seller should see "Awaiting Buyer Payment" when escrow is created but not yet paid
  const isAwaitingBuyerPayment = hasEscrow && isSeller && !isBuyer && 
    (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  
  // Can start delivery: funds received, seller (normal flow)
  const canStartDelivery = hasEscrow && isSeller && escrowState === 'FUNDS_RECEIVED';
  
  // Can show manual start delivery: seller and payment seems to have gone through
  const canManualStartDelivery = hasEscrow && isSeller && 
    (transaction.payment_status === 'Funds in Escrow' || 
     transaction.payment_status === 'Paid' ||
     transaction.funds_received_at ||
     escrowState === 'FUNDS_RECEIVED');
  
  // Can accept delivery: delivery started, buyer (normal flow)
  const canAcceptDeliveryTS = hasEscrow && isBuyer && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState);
  
  // Can show manual accept delivery: buyer and delivery seems to have started
  const canManualAcceptDelivery = hasEscrow && isBuyer &&
    (transaction.payment_status === 'Delivery in Progress' ||
     transaction.delivery_started_at ||
     escrowState === 'INITIATED');
  
  // Legacy flow (without escrow)
  const canConfirmDelivery = !hasEscrow && isBuyer && !transaction.delivery_confirmed && transaction.payment_status === 'Paid';
  
  // Helper to display who pays the fee
  const getFeePayerLabel = (feeAllocation) => {
    if (!feeAllocation) return 'Seller pays fee';
    const normalized = feeAllocation.toUpperCase();
    switch(normalized) {
      case 'BUYER_AGENT':
      case 'BUYER':
        return 'Buyer pays fee';
      case 'SELLER_AGENT':
      case 'SELLER':
        return 'Seller pays fee';
      case 'SPLIT_AGENT':
      case 'BUYER_SELLER_AGENT':
      case 'SPLIT':
        return 'Fee split 50/50';
      default:
        return 'Seller pays fee';
    }
  };

  // Generate share link
  const shareLink = transaction.share_code ? `${window.location.origin}/t/${transaction.share_code}` : null;

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate('/transactions')} data-testid="back-to-transactions-btn" className="mb-4 text-sm h-8">
          <ArrowLeft className="w-4 h-4 mr-1" />Back
        </Button>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content - Left 2 columns */}
          <div className="lg:col-span-2 space-y-5">
            
            {/* Step Progress Tracker */}
            <Card className="p-4">
              <StepProgressTracker transaction={transaction} />
            </Card>

            {/* Transaction Status Card - Shows current state prominently */}
            <TransactionStatusCard 
              transaction={transaction} 
              userRole={isBuyer ? 'buyer' : (isSeller ? 'seller' : 'viewer')} 
            />

            {/* Trust Layer Box */}
            <div className="bg-slate-900 text-white rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-2">TrustTrade Escrow Protection</h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      Funds are securely held in escrow
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      Seller only gets paid after buyer confirms delivery
                    </li>
                    <li className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      Bank payout within 1-2 business days after release
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Risk Warning - Show if medium or high risk */}
            {transaction.risk_level && transaction.risk_level !== 'low' && (
              <Card className={`p-4 ${transaction.risk_level === 'high' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 ${transaction.risk_level === 'high' ? 'text-red-600' : 'text-amber-600'}`} />
                  <div>
                    <p className={`font-medium text-sm ${transaction.risk_level === 'high' ? 'text-red-900' : 'text-amber-900'}`}>
                      {transaction.risk_level === 'high' ? 'High Risk Transaction' : 'Proceed with Caution'}
                    </p>
                    <p className={`text-xs mt-1 ${transaction.risk_level === 'high' ? 'text-red-700' : 'text-amber-700'}`}>
                      Our system has flagged potential risks. Please verify the other party's identity.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Confirmation Status Card - Shows who has confirmed */}
            {(!bothConfirmed) && (
              <Card className="p-5 bg-slate-50 border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-600" />
                  Confirmation Status
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg border ${buyerConfirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-medium text-slate-700">Buyer</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{transaction.buyer_name}</p>
                    {buyerConfirmed ? (
                      <Badge className="mt-2 bg-emerald-100 text-emerald-700 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Confirmed
                      </Badge>
                    ) : (
                      <Badge className="mt-2 bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg border ${sellerConfirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-medium text-slate-700">Seller</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{transaction.seller_name}</p>
                    {sellerConfirmed ? (
                      <Badge className="mt-2 bg-emerald-100 text-emerald-700 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Confirmed
                      </Badge>
                    ) : (
                      <Badge className="mt-2 bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>
                    )}
                  </div>
                </div>
              </Card>
            )}

        {/* Buyer Confirm Card */}
            {canBuyerConfirm && (
              <Card className="p-5 bg-blue-50 border-blue-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1">Action Required: Confirm Details</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Review the transaction details and confirm to proceed with escrow protection.
                    </p>
                    <Button 
                      onClick={handleBuyerConfirm} 
                      disabled={confirming} 
                      className="bg-blue-600 hover:bg-blue-700 h-10"
                      data-testid="buyer-confirm-btn"
                    >
                      {confirming ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Confirm Transaction
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Seller Confirm Card */}
            {canSellerConfirm && (
              <Card className="p-5 bg-orange-50 border-orange-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <FileText className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1">Action Required: Confirm Fee Agreement</h3>
                    <p className="text-sm text-slate-600 mb-2">
                      1.5% TrustTrade fee (min R5). You'll receive R {(transaction.seller_receives ?? (transaction.item_price - transaction.trusttrade_fee))?.toFixed(2)}
                    </p>
                    {profileIncompleteError && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        <p className="font-medium mb-1">Complete your profile before confirming</p>
                        <p className="mb-2">You need to add your <strong>{profileIncompleteError}</strong> before you can confirm transactions.</p>
                        <div className="flex gap-3">
                          <Link to="/settings/banking" className="text-red-700 underline font-medium">Add banking details</Link>
                          <Link to="/verify/phone" className="text-red-700 underline font-medium">Add phone number</Link>
                        </div>
                      </div>
                    )}
                    {profileIncompleteError && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        <p className="font-medium mb-1">Complete your profile before confirming</p>
                        <p className="mb-2">You need to add your <strong>{profileIncompleteError}</strong> before you can confirm transactions.</p>
                        <div className="flex gap-3">
                          <Link to="/settings/banking" className="text-red-700 underline font-medium">Add banking details</Link>
                          <Link to="/verify/phone" className="text-red-700 underline font-medium">Add phone number</Link>
                        </div>
                      </div>
                    )}
                    <Button 
                      onClick={handleSellerConfirm} 
                      disabled={sellerConfirming} 
                      className="bg-orange-600 hover:bg-orange-700 h-10"
                      data-testid="seller-confirm-btn"
                    >
                      {sellerConfirming ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Confirm Fee Agreement
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Create Escrow Card */}
            {canCreateEscrow && (
              <Card className="p-5 bg-emerald-50 border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-emerald-900 mb-1">Action Required: Create Escrow</h3>
                    <p className="text-sm text-emerald-700 mb-3">
                      Both parties confirmed. Create escrow to enable secure payment.
                    </p>
                    <Button 
                      type="button"
                      onClick={handleCreateEscrow} 
                      onTouchEnd={handleCreateEscrow}
                      disabled={creatingEscrow}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 h-10"
                      data-testid="create-escrow-btn"
                    >
                      {creatingEscrow ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Escrow...
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Create Escrow
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

        {/* Make Payment Card (Buyer) */}
        {canMakePayment && (
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <CreditCard className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Pay Securely with TrustTrade</h3>
                <p className="text-sm text-blue-800 mb-4">
                  Your escrow is ready. Select a payment method below to complete your secure payment.
                </p>
                
                {/* Payment Method Selection */}
                <div className="space-y-3 mb-5">
                  {/* EFT Option - Recommended */}
                  <div 
                    onClick={() => setSelectedPaymentMethod('eft')}
                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 touch-manipulation ${
                      selectedPaymentMethod === 'eft' 
                        ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-200' 
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                    data-testid="payment-method-eft"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedPaymentMethod === 'eft' ? 'border-blue-500' : 'border-slate-300'
                      }`}>
                        {selectedPaymentMethod === 'eft' && (
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xl">🏦</span>
                          <span className="font-semibold text-slate-800">EFT Bank Transfer</span>
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Recommended</Badge>
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Lowest Fee</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">Direct bank transfer — most affordable option</p>
                        <p className="text-sm font-medium text-emerald-600 mt-1">Processing fee: 0.86%</p>
                      </div>
                    </div>
                  </div>

                  {/* Card Option */}
                  <div 
                    onClick={() => setSelectedPaymentMethod('card')}
                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 touch-manipulation ${
                      selectedPaymentMethod === 'card' 
                        ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-200' 
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                    data-testid="payment-method-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedPaymentMethod === 'card' ? 'border-blue-500' : 'border-slate-300'
                      }`}>
                        {selectedPaymentMethod === 'card' && (
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">💳</span>
                          <span className="font-semibold text-slate-800">Credit/Debit Card</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">Pay instantly with Visa or Mastercard</p>
                        <p className="text-sm font-medium text-amber-600 mt-1">Processing fee: 2.88%</p>
                      </div>
                    </div>
                  </div>

                  {/* Ozow Option */}
                  <div 
                    onClick={() => setSelectedPaymentMethod('ozow')}
                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 touch-manipulation ${
                      selectedPaymentMethod === 'ozow' 
                        ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-200' 
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                    data-testid="payment-method-ozow"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedPaymentMethod === 'ozow' ? 'border-blue-500' : 'border-slate-300'
                      }`}>
                        {selectedPaymentMethod === 'ozow' && (
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">⚡</span>
                          <span className="font-semibold text-slate-800">Ozow Instant EFT</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">Fast instant payment from your bank app</p>
                        <p className="text-sm font-medium text-blue-600 mt-1">Processing fee: 1.73%</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Dynamic Price Summary */}
                <div className="bg-white rounded-xl p-4 mb-5 border border-slate-200 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Payment Summary
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Item Price:</span>
                      <span className="font-medium text-slate-800">R {transaction.item_price?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">TrustTrade Fee (1.5%, min R5):</span>
                      <span className="font-medium text-slate-800">R {Math.max(transaction.item_price * 0.015, 5)?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        {selectedPaymentMethod === 'eft' && 'EFT Processing Fee (0.86%):'}
                        {selectedPaymentMethod === 'card' && 'Card Processing Fee (2.88%):'}
                        {selectedPaymentMethod === 'ozow' && 'Ozow Processing Fee (1.73%):'}
                        {!selectedPaymentMethod && 'Processing Fee:'}
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedPaymentMethod === 'eft' && `R ${(transaction.item_price * 0.0086)?.toFixed(2)}`}
                        {selectedPaymentMethod === 'card' && `R ${(transaction.item_price * 0.0288)?.toFixed(2)}`}
                        {selectedPaymentMethod === 'ozow' && `R ${(transaction.item_price * 0.0173)?.toFixed(2)}`}
                        {!selectedPaymentMethod && <span className="text-slate-400 italic">Select method</span>}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-900 text-base">Total Amount:</span>
                        <span className="font-bold text-lg text-green-700">
                          {selectedPaymentMethod === 'eft' && `R ${(transaction.item_price + Math.max(transaction.item_price * 0.015, 5) + transaction.item_price * 0.0086)?.toFixed(2)}`}
                          {selectedPaymentMethod === 'card' && `R ${(transaction.item_price + Math.max(transaction.item_price * 0.015, 5) + transaction.item_price * 0.0288)?.toFixed(2)}`}
                          {selectedPaymentMethod === 'ozow' && `R ${(transaction.item_price + Math.max(transaction.item_price * 0.015, 5) + transaction.item_price * 0.0173)?.toFixed(2)}`}
                          {!selectedPaymentMethod && <span className="text-slate-400 text-base font-normal italic">Select payment method</span>}
                        </span>
                      </div>
                      {transaction.fee_allocation !== 'BUYER_AGENT' && (
                        <p className="text-xs text-slate-500 mt-1">
                          {transaction.fee_allocation === 'SELLER_AGENT' ? 'Fees deducted from seller payout' : 'Fees split between buyer and seller'}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Payout Info */}
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800">
                      <strong>Expected Payout:</strong> 1-2 business days after you confirm receipt of the item
                    </p>
                  </div>
                </div>
                
                {/* Pay Button */}
                <Button 
                  type="button"
                  onClick={handleGetPaymentLink} 
                  onTouchEnd={(e) => { e.preventDefault(); handleGetPaymentLink(e); }}
                  disabled={loadingPaymentLink || !selectedPaymentMethod}
                  className={`w-full text-lg py-6 touch-manipulation cursor-pointer transition-all duration-200 ${
                    selectedPaymentMethod 
                      ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800' 
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                  data-testid="make-payment-btn"
                  style={{ touchAction: 'manipulation' }}
                >
                  {loadingPaymentLink ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Loading Payment Page...
                    </>
                  ) : selectedPaymentMethod ? (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" />
                      Pay R {
                        selectedPaymentMethod === 'eft' ? (transaction.item_price * 1.0286)?.toFixed(2) :
                        selectedPaymentMethod === 'card' ? (transaction.item_price * 1.0488)?.toFixed(2) :
                        selectedPaymentMethod === 'ozow' ? (transaction.item_price * 1.0373)?.toFixed(2) :
                        transaction.item_price?.toFixed(2)
                      } Securely
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2 opacity-50" />
                      Select a payment method
                    </>
                  )}
                </Button>
                
                {/* Security Note */}
                <p className="text-xs text-slate-500 mt-3 text-center flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" />
                  Your payment is protected by TrustTrade Escrow
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Seller Awaiting Payment Card */}
        {isAwaitingBuyerPayment && (
          <Card className="p-6 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <CreditCard className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Awaiting Buyer Payment</h3>
                <p className="text-sm text-amber-800 mb-3">
                  The escrow has been created. Waiting for the buyer to make payment. You will be notified once payment is received.
                </p>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Waiting for buyer to pay...</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Funds Received - Seller Start Delivery */}
        {canStartDelivery && (
          <Card className="p-6 bg-purple-50 border-purple-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <Truck className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-purple-900 mb-2">Funds Secured - Deliver Item</h3>
                <p className="text-sm text-purple-800 mb-4">
                  Payment has been received and is held securely in escrow. Please deliver the item to the buyer and mark it as dispatched.
                </p>
                <Button 
                  onClick={handleStartDelivery} 
                  disabled={startingDelivery}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="start-delivery-btn"
                >
                  {startingDelivery ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4 mr-2" />
                      Mark as Dispatched
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Manual Override - Seller Start Delivery (when webhook failed) */}
        {!canStartDelivery && canManualStartDelivery && !transaction.delivery_started_at && (
          <Card className="p-6 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <Truck className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Mark as Dispatched</h3>
                <p className="text-sm text-amber-800 mb-2">
                  Payment appears to have been received. Click below to mark the item as dispatched.
                </p>
                <p className="text-xs text-amber-700 mb-4 p-2 bg-amber-100 rounded">
                  <strong>Note:</strong> Use this if the normal flow isn't showing buttons correctly.
                </p>
                <Button 
                  onClick={handleManualStartDelivery} 
                  disabled={startingDelivery}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="manual-start-delivery-btn"
                >
                  {startingDelivery ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4 mr-2" />
                      Mark as Dispatched
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Buyer Accept Delivery */}
        {canAcceptDeliveryTS && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Confirm Receipt</h3>
                <p className="text-sm text-green-800 mb-4">
                  The seller has dispatched the item. Once you receive it, confirm delivery to release funds to the seller.
                </p>
                <p className="text-xs text-green-700 mb-4 p-2 bg-green-100 rounded">
                  <strong>Important:</strong> Only confirm if you have received the item and are satisfied. This action cannot be undone.
                </p>
                
                {/* Payout Readiness Warning */}
                {payoutReadiness && !payoutReadiness.payout_ready && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Seller Payout Setup Incomplete</p>
                        <p className="text-xs text-amber-700 mt-1">
                          {payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup before funds can be released.'}
                        </p>
                        {payoutReadiness.can_auto_sync && (
                          <p className="text-xs text-amber-600 mt-1">
                            The system will attempt to sync automatically when you confirm.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {checkingPayoutReadiness && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking payout readiness...
                  </div>
                )}
                
                <Button 
                  onClick={handleAcceptDelivery} 
                  disabled={acceptingDelivery || checkingPayoutReadiness}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  data-testid="accept-delivery-btn"
                >
                  {acceptingDelivery ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirm Receipt & Release Funds
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Manual Override - Buyer Accept Delivery (when webhook failed) */}
        {!canAcceptDeliveryTS && canManualAcceptDelivery && !transaction.delivery_confirmed && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Confirm Receipt</h3>
                <p className="text-sm text-green-800 mb-4">
                  Once you have received the item, confirm delivery to release funds to the seller.
                </p>
                <p className="text-xs text-green-700 mb-4 p-2 bg-green-100 rounded">
                  <strong>Important:</strong> Only confirm if you have received the item and are satisfied. This action cannot be undone.
                </p>
                
                {/* Payout Readiness Warning */}
                {payoutReadiness && !payoutReadiness.payout_ready && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Seller Payout Setup Incomplete</p>
                        <p className="text-xs text-amber-700 mt-1">
                          {payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <Button 
                  onClick={handleManualAcceptDelivery} 
                  disabled={acceptingDelivery || checkingPayoutReadiness}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  data-testid="manual-accept-delivery-btn"
                >
                  {acceptingDelivery ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirm Receipt & Release Funds
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Legacy: Status-specific guidance cards (without escrow) */}
        {!hasEscrow && transaction.seller_confirmed && transaction.payment_status === 'Ready for Payment' && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-1">Awaiting Payment</h3>
            <p className="text-sm text-blue-800">
              {isBuyer ? 'Make payment to the escrow account.' : 'Waiting for buyer payment.'}
            </p>
          </Card>
        )}

        {!hasEscrow && transaction.payment_status === 'Paid' && !transaction.delivery_confirmed && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <h3 className="font-semibold text-amber-900 mb-1">Payment Received - Awaiting Delivery</h3>
            <p className="text-sm text-amber-800">
              {isSeller ? 'Deliver the item. Funds released after buyer confirms.' : 'Your payment is held in escrow. Confirm delivery once received.'}
            </p>
          </Card>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="agreement" className="text-xs sm:text-sm">Agreement</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs sm:text-sm">Timeline</TabsTrigger>
            <TabsTrigger value="photos" className="text-xs sm:text-sm">Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />Buyer Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="text-sm font-medium text-slate-900">{transaction.buyer_name}</p>
                  </div>
                  {transaction.buyer_email ? (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Email</p>
                      <p className="text-sm text-slate-700">{transaction.buyer_email}</p>
                    </div>
                  ) : null}
                  {transaction.buyer_phone && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </p>
                      <p className="text-sm text-slate-700 font-mono">{transaction.buyer_phone}</p>
                    </div>
                  )}
                  {transaction.invite_type === 'phone' && !transaction.buyer_email && !transaction.buyer_phone && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Invited via phone
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />Seller Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="text-sm font-medium text-slate-900">{transaction.seller_name}</p>
                  </div>
                  {transaction.seller_email ? (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Email</p>
                      <p className="text-sm text-slate-700">{transaction.seller_email}</p>
                    </div>
                  ) : null}
                  {transaction.seller_phone && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </p>
                      <p className="text-sm text-slate-700 font-mono">{transaction.seller_phone}</p>
                    </div>
                  )}
                  {transaction.invite_type === 'phone' && !transaction.seller_email && !transaction.seller_phone && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Invited via phone
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Details</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{transaction.item_description}</p>
                </div>
                {transaction.item_condition && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Condition</p>
                    <Badge className="bg-slate-100 text-slate-700">{transaction.item_condition}</Badge>
                  </div>
                )}
                {transaction.known_issues && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Known Issues</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{transaction.known_issues}</p>
                  </div>
                )}
                {transaction.delivery_method && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Delivery Method</p>
                    <Badge className="bg-blue-100 text-blue-800">
                      {transaction.delivery_method === 'courier' && 'Courier / Physical Delivery'}
                      {transaction.delivery_method === 'bank_deposit' && 'Bank Deposit / Cash Collection'}
                      {transaction.delivery_method === 'digital' && 'Digital Delivery / Link'}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-1">
                      {transaction.delivery_method === 'courier' && '3-day auto-release after delivery confirmation'}
                      {transaction.delivery_method === 'bank_deposit' && '2-day auto-release after payment confirmation'}
                      {transaction.delivery_method === 'digital' && 'Immediate release after confirmation'}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Price Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Item Price:</span>
                  <span className="font-mono font-medium text-slate-900">R {transaction.item_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">TrustTrade Fee (1.5%):</span>
                  <span className="font-mono font-medium text-slate-900">R {transaction.trusttrade_fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-600">Fee Paid By:</span>
                  <Badge className="bg-blue-100 text-blue-800" data-testid="fee-payer-badge">
                    {getFeePayerLabel(transaction.fee_allocation)}
                  </Badge>
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between">
                  <span className="font-semibold text-slate-900">Total Secure Payment:</span>
                  <span className="font-mono font-bold text-primary text-xl">R {transaction.total.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="agreement" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Escrow Agreement</h3>
              {transaction.seller_confirmed ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">The escrow agreement has been generated and is available for download.</p>
                  <Button onClick={handleDownloadPDF} data-testid="download-agreement-btn">
                    <Download className="w-4 h-4 mr-2" />Download Agreement (PDF)
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Agreement will be available once the seller confirms the transaction details.</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Transaction Progress</h3>
              
              {/* New Visual Timeline */}
              <div className="mb-8">
                <TransactionTimeline 
                  transaction={transaction}
                  currentState={transaction.transaction_state || mapPaymentStatusToState(transaction.payment_status, transaction.tradesafe_state)}
                  timeline={transaction.timeline}
                />
              </div>
              
              {/* Auto-Release Countdown (if applicable) */}
              {transaction.transaction_state === 'DELIVERED' && (
                <div className="mb-6">
                  <AutoReleaseCountdown 
                    autoReleaseAt={transaction.auto_release_at}
                    hasDispute={transaction.has_dispute}
                  />
                </div>
              )}
              
              {/* Legacy Timeline Events */}
              <div className="border-t border-slate-200 pt-6">
                <h4 className="text-sm font-medium text-slate-700 mb-4">Event History</h4>
                <Timeline transaction={transaction} />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Photos</h3>
              {transaction.item_photos && transaction.item_photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {transaction.item_photos.map((photo, index) => {
                    // Construct full URL for the photo
                    const photoUrl = photo.startsWith('http')
                       ? photo
                       : `${BASE_URL}/uploads/photos/${photo}`;
                    return (
                      <div 
                        key={index} 
                        className="relative cursor-pointer group"
                        onClick={() => window.open(photoUrl, '_blank')}
                      >
                        <img 
                          src={photoUrl}
                          alt={`Item photo ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg bg-slate-100 group-hover:opacity-90 transition-opacity"
                          onError={(e) => { 
                            e.target.onerror = null;
                            e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23f1f5f9" width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="14">No Image</text></svg>'; 
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-sm bg-black/50 px-3 py-1 rounded">
                            Click to view
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No photos uploaded</p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {canConfirmDelivery && (
          <Card className="p-6 bg-green-50 border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-4">Final Step: Confirm Delivery</h3>
            <p className="text-sm text-green-800 mb-2">
              Payment has been received and is held in escrow.
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Have you received the item/service and are satisfied? Confirming delivery will release the funds to the seller. This action cannot be undone.
            </p>
            <Button onClick={handleConfirmDelivery} disabled={confirming} data-testid="confirm-delivery-btn" className="bg-green-600 hover:bg-green-700">
              {confirming ? 'Processing...' : 'Confirm Delivery & Release Funds'}
            </Button>
          </Card>
        )}

        {transaction.delivery_confirmed && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Delivery Confirmed</p>
                <p className="text-sm text-green-700">Funds have been released to the seller</p>
              </div>
            </div>
          </Card>
        )}

        {/* Rating Section - Only show after delivery is confirmed */}
        {transaction.delivery_confirmed && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />Rate This Transaction
            </h3>
            
            {/* Check if user has already rated */}
            {isBuyer && transaction.buyer_rating ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Your rating for the seller:</p>
                <StarRating value={transaction.buyer_rating} readOnly size="w-6 h-6" />
                {transaction.buyer_review && (
                  <p className="text-sm text-slate-700 italic">"{transaction.buyer_review}"</p>
                )}
              </div>
            ) : isSeller && transaction.seller_rating ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Your rating for the buyer:</p>
                <StarRating value={transaction.seller_rating} readOnly size="w-6 h-6" />
                {transaction.seller_review && (
                  <p className="text-sm text-slate-700 italic">"{transaction.seller_review}"</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  {isBuyer 
                    ? 'Rate your experience with the seller:' 
                    : 'Rate your experience with the buyer:'}
                </p>
                <StarRating 
                  value={rating} 
                  onSelect={setRating} 
                  onHover={setHoverRating}
                />
                <div>
                  <label className="text-sm text-slate-600 mb-2 block">Review (optional)</label>
                  <Textarea
                    placeholder="Share your experience..."
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    rows={3}
                    data-testid="review-textarea"
                  />
                </div>
                <Button 
                  onClick={handleSubmitRating} 
                  disabled={submittingRating || rating === 0}
                  data-testid="submit-rating-btn"
                >
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </Button>
              </div>
            )}

            {/* Show other party's rating if available */}
            {isBuyer && transaction.seller_rating && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-2">Seller's rating for you:</p>
                <StarRating value={transaction.seller_rating} readOnly size="w-5 h-5" />
                {transaction.seller_review && (
                  <p className="text-sm text-slate-700 italic mt-2">"{transaction.seller_review}"</p>
                )}
              </div>
            )}
            {isSeller && transaction.buyer_rating && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-2">Buyer's rating for you:</p>
                <StarRating value={transaction.buyer_rating} readOnly size="w-5 h-5" />
                {transaction.buyer_review && (
                  <p className="text-sm text-slate-700 italic mt-2">"{transaction.buyer_review}"</p>
                )}
              </div>
            )}
          </Card>
        )}

        {!transaction.delivery_confirmed && transaction.seller_confirmed && (
              <Card className="p-4">
                <p className="text-sm text-slate-600 mb-2">Having issues?</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/disputes-dashboard', { state: { transactionId: transaction.transaction_id } })}>
                  <FileText className="w-4 h-4 mr-1" />Raise Dispute
                </Button>
              </Card>
            )}

          </div>
          {/* END Main Content Column */}

          {/* Sticky Sidebar - Deal Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Deal Summary Card */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Deal Summary</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Item</p>
                    <p className="font-medium text-slate-900 line-clamp-2">{transaction.item_description}</p>
                  </div>
                  {transaction.item_condition && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Condition</p>
                      <Badge className="bg-slate-100 text-slate-700 text-xs">{transaction.item_condition}</Badge>
                    </div>
                  )}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500">Price</span>
                      <span className="font-mono font-medium">R {transaction.item_price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500">TrustTrade Fee</span>
                      <span className="font-mono text-slate-600">R {transaction.trusttrade_fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="font-medium text-slate-700">Seller Receives</span>
                      <span className="font-mono font-bold text-emerald-600">
                        R {(transaction.seller_receives ?? (transaction.item_price - transaction.trusttrade_fee))?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Share Link */}
              {shareLink && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">Share Code</span>
                    <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-slate-50 px-2 py-1 rounded truncate">{transaction.share_code}</code>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleCopyLink}
                      data-testid="copy-share-link-btn"
                      className="h-8 px-2"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Parties */}
              <Card className="p-4">
                <h4 className="text-xs font-medium text-slate-500 mb-3">PARTIES</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{transaction.buyer_name}</p>
                      <p className="text-xs text-slate-500">
                        Buyer {transaction.buyer_phone && <span className="text-blue-500 ml-1">• via phone</span>}
                      </p>
                    </div>
                    {buyerConfirmed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{transaction.seller_name}</p>
                      <p className="text-xs text-slate-500">
                        Seller {transaction.seller_phone && <span className="text-blue-500 ml-1">• via phone</span>}
                      </p>
                    </div>
                    {sellerConfirmed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
              </Card>

              {/* Refresh Status */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncStatus}
                disabled={syncing}
                className="w-full h-9"
                data-testid="refresh-transaction-btn"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {syncing ? 'Syncing...' : 'Refresh Status'}
              </Button>

              {/* Escrow Status Badge */}
              {hasEscrow && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-800">Escrow Active</span>
                  </div>
                  <p className="text-xs text-emerald-600">
                    Ref: {transaction.tradesafe_id?.slice(0, 12)}...
                  </p>
                  <Badge className={`mt-2 text-[10px] ${getEscrowStateBadge(escrowState).bg} ${getEscrowStateBadge(escrowState).text}`}>
                    {getEscrowStateBadge(escrowState).label}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          {/* END Sticky Sidebar */}
          
        </div>
        {/* END Two Column Layout */}
      </div>
    </DashboardLayout>
  );
}

export default TransactionDetail;
