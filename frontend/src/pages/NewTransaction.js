import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import PhotoUploader from '../components/PhotoUploader';
import api from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, User, Camera, Shield, CheckCircle, Truck, Banknote, Zap, Check, AlertCircle, Loader2 } from 'lucide-react';
import EmailVerificationPrompt from '../components/EmailVerificationPrompt';
import { usePlatformConfig } from '../context/PlatformConfigContext';
import { getDefaultMinimumTransactionAmount, getPayoutScheduleMessage } from '../utils/payoutSchedule';

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

const COURIER_ENABLED = process.env.REACT_APP_COURIER_ENABLED !== 'false';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function splitTrustTradeFee(totalFee, feeAllocation) {
  const fee = roundMoney(totalFee);
  const alloc = (feeAllocation || 'BUYER').toUpperCase();

  if (['SELLER', 'SELLER_AGENT'].includes(alloc)) {
    return { buyerFee: 0, sellerFee: fee };
  }
  if (['BUYER_SELLER', 'SPLIT', 'SPLIT_AGENT', 'BUYER_SELLER_AGENT'].includes(alloc)) {
    const buyerFee = roundMoney(fee / 2);
    return { buyerFee, sellerFee: roundMoney(fee - buyerFee) };
  }
  return { buyerFee: fee, sellerFee: 0 };
}

const ITEM_CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'sports', label: 'Sports & Outdoor' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];

const S = {
  page: { maxWidth: 640, margin: '0 auto' },
  card: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #f1f5f9',
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
    padding: '22px 24px',
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 40,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    fontSize: 13,
    color: '#0f172a',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    fontSize: 13,
    color: '#0f172a',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: 80,
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    height: 40,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    fontSize: 13,
    color: '#0f172a',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  btnSuccess: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: 'none',
    background: '#10b981',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 16,
  },
};

function NewTransaction() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('seller');
  const [photos, setPhotos] = useState([]);
  const [formData, setFormData] = useState({
    buyer_name: '',
    buyer_email: '',
    seller_name: '',
    seller_email: '',
    item_description: '',
    item_category: '',
    item_condition: '',
    known_issues: '',
    item_price: '',
    fee_allocation: 'BUYER',
    delivery_method: 'courier',
  });
  const [confirmations, setConfirmations] = useState({
    buyer_details: false,
    seller_details: false,
    item_accuracy: false,
  });
  const [improveLoading, setImproveLoading] = useState(false);
  const [courierForm, setCourierForm] = useState({
    collection_preference: 'collection', // 'collection' = Courier Guy collects | 'dropoff' = seller drops off
    pickup_street: '', pickup_area: '', pickup_city: '', pickup_code: '',
    delivery_street: '', delivery_area: '', delivery_city: '', delivery_code: '',
    weight: '2', length: '30', width: '20', height: '15',
  });
  const [courierQuotes, setCourierQuotes] = useState([]);
  const [courierLoading, setCourierLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const { config: platformConfig } = usePlatformConfig();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (role === 'buyer') {
      setFormData(prev => ({
        ...prev,
        buyer_name: user.name,
        buyer_email: user.email,
        // When switching to buyer, preserve what was typed as "other party" (buyer fields)
        // by moving it into the seller fields (now the other party).
        seller_name: prev.seller_name === user.name || !prev.seller_name ? prev.buyer_name : prev.seller_name,
        seller_email: prev.seller_email === user.email || !prev.seller_email ? prev.buyer_email : prev.seller_email,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        seller_name: user.name,
        seller_email: user.email,
        // When switching to seller, preserve what was typed as "other party" (seller fields)
        // by moving it into the buyer fields (now the other party).
        buyer_name: prev.buyer_name === user.name || !prev.buyer_name ? prev.seller_name : prev.buyer_name,
        buyer_email: prev.buyer_email === user.email || !prev.buyer_email ? prev.seller_email : prev.buyer_email,
      }));
    }
  }, [role, user]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      navigate('/');
    }
  };

  const hasBankingDetails = Boolean(
    user?.banking_details_completed &&
    user?.banking_details?.bank_name &&
    user?.banking_details?.account_number
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImproveDescription = async () => {
    if (!formData.item_description || improveLoading) return;
    setImproveLoading(true);
    try {
      const res = await api.post('/ai/improve-description', {
        description: formData.item_description,
        item_price: parseFloat(formData.item_price) || 0,
        delivery_method: formData.delivery_method || 'courier',
      });
      setFormData(prev => ({ ...prev, item_description: res.data.improved }));
      toast.success('Description improved!');
    } catch {
      toast.error('Could not improve description. Please try again.');
    } finally {
      setImproveLoading(false);
    }
  };

  const handleGetQuote = async () => {
    setCourierLoading(true);
    setCourierQuotes([]);
    setSelectedQuote(null);
    try {
      const res = await api.post('/courier/quote', {
        // For drop-off the seller brings the parcel to a Courier Guy point, so the exact
        // street isn't required — fall back to a label while keeping area/city/code for rating.
        pickup_address: { street_address: courierForm.pickup_street || (isDropoff ? 'Courier Guy drop-off point' : ''), local_area: courierForm.pickup_area, city: courierForm.pickup_city, code: courierForm.pickup_code, country: 'ZA', type: 'residential' },
        delivery_address: { street_address: courierForm.delivery_street, local_area: courierForm.delivery_area, city: courierForm.delivery_city, code: courierForm.delivery_code, country: 'ZA', type: 'residential' },
        parcel: { submitted_weight_kg: parseFloat(courierForm.weight) || 1, submitted_length_cm: parseFloat(courierForm.length) || 10, submitted_width_cm: parseFloat(courierForm.width) || 10, submitted_height_cm: parseFloat(courierForm.height) || 10 },
      });
      const rates = res.data.rates || [];
      setCourierQuotes(rates);
      if (rates.length === 0) toast.info('No courier options available for these addresses.');
      else toast.success(`${rates.length} delivery option${rates.length !== 1 ? 's' : ''} found`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 502 || status === 503 || !status) {
        toast.error('Courier booking unavailable right now. Please choose a different delivery method.');
      } else if (status === 422) {
        toast.error('Invalid address or parcel details. Please check and try again.');
      } else {
        toast.error('Could not get courier quote. Please check the addresses and try again.');
      }
    } finally {
      setCourierLoading(false);
    }
  };

  const itemPrice = parseFloat(formData.item_price) || 0;
  const minimumTransactionAmount = getDefaultMinimumTransactionAmount(platformConfig);
  const maximumTransactionAmount = Number(platformConfig.maximum_transaction || 0);
  const payoutSchedule = useMemo(() => getPayoutScheduleMessage(new Date(), platformConfig), [platformConfig]);
  const feeAlloc = formData.fee_allocation || 'BUYER';
  const isCourierDelivery = formData.delivery_method === 'courier';
  const isDropoff = courierForm.collection_preference === 'dropoff';
  // Coerce to a number — ShipLogic can return the rate as a string, which would
  // otherwise string-concatenate into the totals instead of adding numerically.
  const courierFee = isCourierDelivery && selectedQuote ? (Number(selectedQuote?.price ?? selectedQuote?.rate ?? 0) || 0) : 0;
  const courierTotal = courierFee;
  const platformFee = roundMoney(Math.max(itemPrice * 0.02, 5));
  const trusttradeFee = platformFee; // alias kept for any legacy references
  const { buyerFee: buyerFeeContrib, sellerFee: sellerFeeContrib } = splitTrustTradeFee(platformFee, feeAlloc);
  const buyerPaysTotal = roundMoney(itemPrice + courierTotal + buyerFeeContrib);
  const sellerPayout = roundMoney(itemPrice - sellerFeeContrib);
  const feePreview = (allocation) => {
    const { buyerFee, sellerFee } = splitTrustTradeFee(platformFee, allocation);
    return {
      buyerPays: roundMoney(itemPrice + courierTotal + buyerFee),
      sellerReceives: roundMoney(itemPrice - sellerFee),
    };
  };

  const canProceedStep1 = role && (
    role === 'buyer'
      ? (formData.seller_name && formData.seller_email)
      : (formData.buyer_name && formData.buyer_email)
  );

  const amountTooLow = itemPrice > 0 && itemPrice < minimumTransactionAmount;
  const amountTooHigh = maximumTransactionAmount > 0 && itemPrice > maximumTransactionAmount;
  const canProceedStep2 = formData.item_description && formData.item_category &&
    formData.item_condition && itemPrice >= minimumTransactionAmount && !amountTooHigh;
  const amountError = amountTooLow
    ? `Minimum transaction amount is R${minimumTransactionAmount.toFixed(0)} to cover processing fees.`
    : amountTooHigh
      ? `Maximum transaction amount is R${maximumTransactionAmount.toLocaleString('en-ZA')}.`
      : '';

  const canProceedStep3 = photos.length >= 1;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.phone_verified) {
      toast.error('Verify your phone number to continue.');
      navigate('/verify/phone');
      return;
    }

    if (!confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy) {
      toast.error('Please tick all confirmation checkboxes');
      return;
    }
    if (itemPrice < minimumTransactionAmount) {
      toast.error(`Minimum transaction amount is R${minimumTransactionAmount.toFixed(0)} to cover processing fees.`);
      return;
    }
    if (maximumTransactionAmount > 0 && itemPrice > maximumTransactionAmount) {
      toast.error(`Maximum transaction amount is R${maximumTransactionAmount.toLocaleString('en-ZA')}.`);
      return;
    }

    setLoading(true);
    try {
      const transactionResponse = await api.post('/transactions', {
        creator_role: role,
        buyer_name: role === 'buyer' ? user.name : formData.buyer_name,
        buyer_email: role === 'buyer' ? user.email : formData.buyer_email,
        seller_name: role === 'seller' ? user.name : formData.seller_name,
        seller_email: role === 'seller' ? user.email : formData.seller_email,
        item_description: formData.item_description,
        item_category: formData.item_category,
        item_condition: formData.item_condition,
        known_issues: formData.known_issues || 'None',
        item_price: itemPrice,
        fee_allocation: formData.fee_allocation,
        delivery_method: formData.delivery_method,
        ...(isCourierDelivery && selectedQuote ? {
          courier_quote_id: selectedQuote?.service_level?.code || selectedQuote?.id || selectedQuote?.code || '',
          courier_service_name: selectedQuote?.service_level?.name || selectedQuote?.name || '',
          courier_fee: courierFee,
          courier_handling_fee: 0,
          courier_collection_preference: courierForm.collection_preference,
          // Full pickup/delivery/parcel details so the backend can auto-book the
          // shipment once the escrow is funded (no caller needs to re-enter them).
          courier_details: {
            pickup_address: { street_address: courierForm.pickup_street || (isDropoff ? 'Courier Guy drop-off point' : ''), local_area: courierForm.pickup_area, city: courierForm.pickup_city, code: courierForm.pickup_code, country: 'ZA', type: 'residential' },
            delivery_address: { street_address: courierForm.delivery_street, local_area: courierForm.delivery_area, city: courierForm.delivery_city, code: courierForm.delivery_code, country: 'ZA', type: 'residential' },
            parcel: { submitted_weight_kg: parseFloat(courierForm.weight) || 1, submitted_length_cm: parseFloat(courierForm.length) || 10, submitted_width_cm: parseFloat(courierForm.width) || 10, submitted_height_cm: parseFloat(courierForm.height) || 10 },
          },
        } : {}),
        buyer_details_confirmed: confirmations.buyer_details,
        seller_details_confirmed: confirmations.seller_details,
        item_accuracy_confirmed: confirmations.item_accuracy,
      });

      const transactionId = transactionResponse.data.transaction_id;
      const photoFilenames = photos.map(p => p.filename);
      await api.patch(`/transactions/${transactionId}/photos`, photoFilenames, {
        headers: { 'Content-Type': 'application/json' },
      });

      toast.success('Transaction created! Share the link with the other party.');
      navigate(`/transactions/${transactionId}`);
    } catch (error) {
      if (error.response?.data?.detail === 'EMAIL_NOT_VERIFIED') {
        setEmailVerificationRequired(true);
      } else {
        console.error('Failed to create transaction:', error);
        toast.error(parseErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const STEPS = ['Parties', 'Item Details', 'Photos', 'Confirm'];

  return (
    <DashboardLayout user={user}>
      <div style={S.page}>

        {!user.phone_verified && (
          <div style={{ ...S.card, borderLeft: '3px solid #f59e0b', background: '#fffbeb', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#78350f' }}>Verify your phone number to continue.</p>
              <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>Phone verification is required before you can create a transaction or access payment actions.</p>
            </div>
            <button type="button" onClick={() => navigate('/verify/phone')} style={{ ...S.btnPrimary, width: 'auto', height: 38, padding: '0 14px', background: '#f59e0b' }}>
              Verify phone
            </button>
          </div>
        )}

        {role === 'seller' && !hasBankingDetails && (
          <div style={{ ...S.card, borderLeft: '3px solid #dc2626', background: '#fef2f2', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#7f1d1d' }}>Add your banking details to receive payouts</p>
              <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>You must add your banking details before creating a deal as a seller.</p>
            </div>
            <button type="button" onClick={() => navigate('/settings/banking')} style={{ ...S.btnPrimary, width: 'auto', height: 38, padding: '0 14px', background: '#dc2626', flexShrink: 0 }}>
              My Profile
            </button>
          </div>
        )}

        {/* Back button */}
        <button
          type="button"
          style={S.btnGhost}
          onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard')}
          data-testid="back-btn"
        >
          <ArrowLeft size={14} />
          {step > 1 ? 'Back' : 'Dashboard'}
        </button>

        {/* Progress stepper */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          {STEPS.map((label, idx) => {
            const num = idx + 1;
            const done = step > num;
            const active = step === num;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    background: done ? '#10b981' : active ? '#3b82f6' : '#f1f5f9',
                    color: done || active ? '#fff' : '#94a3b8',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                  }}>
                    {done ? <CheckCircle size={14} /> : num}
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#0f172a' : '#94a3b8',
                    whiteSpace: 'nowrap',
                  }} className="hidden sm:inline">
                    {label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '0 10px',
                    background: step > num ? '#10b981' : '#f1f5f9',
                    transition: 'background 0.3s',
                    minWidth: 16,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>

          {/* â"€â"€ Step 1: Role & Other Party â"€â"€ */}
          {step === 1 && (
            <div>
              <div style={S.card}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                  Who are you in this transaction?
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
                  Select your role. We'll auto-fill your details.
                </p>

                {/* Role selector */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  {[
                    {
                      value: 'seller',
                      icon: Banknote,
                      iconColor: '#10b981',
                      title: "I'm the Seller",
                      desc: "I'm selling an item and want to get paid securely",
                      testId: 'role-seller',
                    },
                    {
                      value: 'buyer',
                      icon: Shield,
                      iconColor: '#3b82f6',
                      title: "I'm the Buyer",
                      desc: "I'm buying and want my payment protected",
                      testId: 'role-buyer',
                    },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={opt.testId}
                      onClick={() => setRole(opt.value)}
                      style={{
                        padding: '14px 14px',
                        borderRadius: 10,
                        border: `2px solid ${role === opt.value ? '#3b82f6' : '#e2e8f0'}`,
                        background: role === opt.value ? '#eff6ff' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <opt.icon size={15} color={opt.iconColor} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{opt.title}</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Your details */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #f1f5f9',
                  marginBottom: 20,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <User size={14} color="#fff" />
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', margin: 0 }}>{user.name}</p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{user.email}</p>
                  </div>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                    background: role === 'seller' ? '#ecfdf5' : '#eff6ff',
                    color: role === 'seller' ? '#059669' : '#2563eb',
                    padding: '3px 8px', borderRadius: 20,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {role}
                  </span>
                </div>

                {/* Other party prompt */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#eff6ff', border: '1.5px solid #93c5fd',
                  borderRadius: 10, padding: '11px 14px', marginBottom: 16,
                }}>
                  <span style={{ fontSize: 18 }}>👇</span>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                    Now enter your {role === 'buyer' ? 'seller' : 'buyer'}'s details below
                  </p>
                </div>

                {/* Other party */}
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
                  {role === 'buyer' ? 'Seller' : 'Buyer'} Details
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={S.label}>{role === 'buyer' ? 'Seller' : 'Buyer'} Name</label>
                    <input
                      style={S.input}
                      name={role === 'buyer' ? 'seller_name' : 'buyer_name'}
                      value={role === 'buyer' ? formData.seller_name : formData.buyer_name}
                      onChange={handleChange}
                      placeholder="Full name"
                      data-testid="other-name-input"
                    />
                  </div>
                  <div>
                    <label style={S.label}>{role === 'buyer' ? 'Seller' : 'Buyer'} Email or Phone</label>
                    <input
                      style={S.input}
                      name={role === 'buyer' ? 'seller_email' : 'buyer_email'}
                      value={role === 'buyer' ? formData.seller_email : formData.buyer_email}
                      onChange={handleChange}
                      placeholder="email@example.com or +27..."
                      data-testid="other-email-input"
                    />
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '5px 0 0' }}>
                      They'll receive a secure link to join
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                style={{ ...S.btnPrimary, opacity: canProceedStep1 ? 1 : 0.45, cursor: canProceedStep1 ? 'pointer' : 'not-allowed' }}
                onClick={() => canProceedStep1 && setStep(2)}
                disabled={!canProceedStep1}
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* â"€â"€ Step 2: Item Details â"€â"€ */}
          {step === 2 && (
            <div>
              {/* Item basics */}
              <div style={S.card}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 18px' }}>
                  What's being sold?
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={S.label}>Item Description</label>
                    <textarea
                      style={S.textarea}
                      name="item_description"
                      value={formData.item_description}
                      onChange={handleChange}
                      placeholder="Describe the item in detail - model, specs, what's included..."
                      rows={3}
                      data-testid="item-description-input"
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={handleImproveDescription}
                        disabled={!formData.item_description || improveLoading}
                        data-testid="improve-description-btn"
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: '1px solid #bfdbfe',
                          background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600,
                          cursor: !formData.item_description || improveLoading ? 'not-allowed' : 'pointer',
                          opacity: !formData.item_description || improveLoading ? 0.5 : 1,
                          fontFamily: 'inherit',
                        }}
                      >
                        {improveLoading ? 'Improving…' : '✨ Improve with AI'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={S.label}>Category</label>
                      <select
                        style={S.select}
                        value={formData.item_category}
                        onChange={e => setFormData(p => ({ ...p, item_category: e.target.value }))}
                        data-testid="item-category-select"
                      >
                        <option value="">Select...</option>
                        {ITEM_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Condition</label>
                      <select
                        style={S.select}
                        value={formData.item_condition}
                        onChange={e => setFormData(p => ({ ...p, item_condition: e.target.value }))}
                        data-testid="item-condition-select"
                      >
                        <option value="">Select...</option>
                        <option value="New">New</option>
                        <option value="Used">Used</option>
                        <option value="Used - Minor Defects">Used - Minor Defects</option>
                        <option value="Used - Major Defects">Used - Major Defects</option>
                        <option value="Sold As-Is">Sold As-Is</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={S.label}>Known Issues (optional)</label>
                    <input
                      style={S.input}
                      name="known_issues"
                      value={formData.known_issues}
                      onChange={handleChange}
                      placeholder="None - leave blank if no issues"
                    />
                  </div>

                  <div>
                    <label style={S.label}>Price (R)</label>
                    <input
                      style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}
                      name="item_price"
                      type="number"
                      min={minimumTransactionAmount}
                      step="0.01"
                      value={formData.item_price}
                      onChange={handleChange}
                      placeholder="0.00"
                      aria-invalid={Boolean(amountError)}
                      data-testid="item-price-input"
                    />
                    <p style={{ fontSize: 11, color: amountError ? '#dc2626' : '#94a3b8', margin: '5px 0 0' }}>
                      Minimum transaction amount is R{minimumTransactionAmount.toFixed(0)}. No maximum limit.
                    </p>
                    {amountError && (
                      <p style={{ fontSize: 11, color: '#dc2626', margin: '4px 0 0', fontWeight: 600 }}>
                        {amountError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Delivery Method */}
              <div style={S.card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 14px' }}>How will the item be delivered?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { value: 'courier', icon: Truck, label: 'Courier Guy — we book delivery for you', desc: 'Buyer confirms receipt before payment is released.' },
                    { value: 'bank_deposit', icon: Banknote, label: 'In-Person Meeting — meet to exchange', desc: 'Payment is released once the handover is confirmed.' },
                    { value: 'digital', icon: Zap, label: 'Digital Delivery — files, codes or online services', desc: 'e.g. graphic design, software, documents. Payment is released once the digital delivery is confirmed.' },
                  ].map(opt => {
                    const active = formData.delivery_method === opt.value;
                    return (
                      <label
                        key={opt.value}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '11px 14px', borderRadius: 10,
                          border: `1.5px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                          background: active ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="radio"
                          name="delivery_method"
                          value={opt.value}
                          checked={active}
                          onChange={handleChange}
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${active ? '#3b82f6' : '#cbd5e1'}`,
                          background: active ? '#3b82f6' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <opt.icon size={15} color={active ? '#3b82f6' : '#94a3b8'} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{opt.label}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{opt.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Fee Allocation */}
              <div style={S.card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>Who pays the TrustTrade platform fee?</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>TrustTrade charges a 2% fee (min R5) to protect both parties.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      value: 'BUYER',
                      label: 'Buyer pays',
                      desc: itemPrice >= 100 ? `Buyer pays R${feePreview('BUYER').buyerPays.toFixed(2)} - seller receives R${feePreview('BUYER').sellerReceives.toFixed(2)}` : 'Fee added to buyer payment - seller receives full item value.',
                    },
                    {
                      value: 'SELLER',
                      label: 'Seller pays',
                      desc: itemPrice >= 100 ? `Buyer pays R${feePreview('SELLER').buyerPays.toFixed(2)} - seller receives R${feePreview('SELLER').sellerReceives.toFixed(2)}` : 'Fee deducted from seller payout.',
                    },
                    {
                      value: 'BUYER_SELLER',
                      label: 'Split 50/50',
                      desc: itemPrice >= 100 ? `Buyer pays R${feePreview('BUYER_SELLER').buyerPays.toFixed(2)} - seller receives R${feePreview('BUYER_SELLER').sellerReceives.toFixed(2)}` : 'Half from buyer, half from seller.',
                    },
                  ].map(opt => {
                    const active = feeAlloc === opt.value;
                    return (
                      <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${active ? '#3b82f6' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <input type="radio" name="fee_allocation" value={opt.value} checked={active} onChange={handleChange} style={{ display: 'none' }} />
                        <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? '#3b82f6' : '#cbd5e1'}`, background: active ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                          {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{opt.label}</span>
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{opt.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Courier Guy Delivery — shown automatically when Courier Guy is the chosen delivery method */}
              {COURIER_ENABLED && isCourierDelivery && (
                <div style={S.card}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10 }}>
                    <Truck size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e3a8a', display: 'block', marginBottom: 2 }}>TrustTrade books the courier for you</span>
                      <span style={{ fontSize: 12, color: '#1d4ed8', lineHeight: 1.5 }}>
                        Enter the pickup and delivery addresses below and we'll arrange the Courier Guy shipment on your behalf —
                        the delivery cost is added to this transaction and held in escrow. You don't need to book or pay the courier separately.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Collection preference */}
                      <div>
                        <label style={S.label}>How will the parcel reach Courier Guy?</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                          {[
                            { value: 'collection', label: 'Collection', desc: 'Courier Guy collects from the seller’s address.' },
                            { value: 'dropoff', label: 'Drop-off', desc: 'Seller drops it at a Courier Guy drop-off point.' },
                          ].map(opt => {
                            const active = courierForm.collection_preference === opt.value;
                            return (
                              <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${active ? '#3b82f6' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <input type="radio" name="collection_preference" value={opt.value} checked={active} onChange={e => setCourierForm(p => ({ ...p, collection_preference: e.target.value }))} style={{ display: 'none' }} />
                                <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1, border: `2px solid ${active ? '#3b82f6' : '#cbd5e1'}`, background: active ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                </div>
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'block' }}>{opt.label}</span>
                                  <span style={{ fontSize: 11, color: '#64748b' }}>{opt.desc}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pickup */}
                      <div>
                        <label style={S.label}>{isDropoff ? 'Seller’s Area (for pricing the drop-off)' : 'Pickup Address (Seller)'}</label>
                        {isDropoff && (
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>
                            No street address needed — the seller takes the parcel to a Courier Guy point. We just need the area and postal code to price the route.
                          </p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {!isDropoff && (
                            <input style={S.input} placeholder="Street address" value={courierForm.pickup_street} onChange={e => setCourierForm(p => ({ ...p, pickup_street: e.target.value }))} />
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                            <input style={S.input} placeholder="Suburb / area" value={courierForm.pickup_area} onChange={e => setCourierForm(p => ({ ...p, pickup_area: e.target.value }))} />
                            <input style={S.input} placeholder="City" value={courierForm.pickup_city} onChange={e => setCourierForm(p => ({ ...p, pickup_city: e.target.value }))} />
                          </div>
                          <input style={{ ...S.input, maxWidth: 160 }} placeholder="Postal code" value={courierForm.pickup_code} onChange={e => setCourierForm(p => ({ ...p, pickup_code: e.target.value }))} />
                        </div>
                      </div>

                      {/* Delivery */}
                      <div>
                        <label style={S.label}>Delivery Address (Buyer)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input style={S.input} placeholder="Street address" value={courierForm.delivery_street} onChange={e => setCourierForm(p => ({ ...p, delivery_street: e.target.value }))} />
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                            <input style={S.input} placeholder="Suburb / area" value={courierForm.delivery_area} onChange={e => setCourierForm(p => ({ ...p, delivery_area: e.target.value }))} />
                            <input style={S.input} placeholder="City" value={courierForm.delivery_city} onChange={e => setCourierForm(p => ({ ...p, delivery_city: e.target.value }))} />
                          </div>
                          <input style={{ ...S.input, maxWidth: 160 }} placeholder="Postal code" value={courierForm.delivery_code} onChange={e => setCourierForm(p => ({ ...p, delivery_code: e.target.value }))} />
                        </div>
                      </div>

                      {/* Parcel dimensions */}
                      <div>
                        <label style={S.label}>Parcel Details</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
                          {[
                            { label: 'Weight (kg)', key: 'weight' },
                            { label: 'Length (cm)', key: 'length' },
                            { label: 'Width (cm)', key: 'width' },
                            { label: 'Height (cm)', key: 'height' },
                          ].map(f => (
                            <div key={f.key}>
                              <label style={{ ...S.label, fontSize: 10, marginBottom: 4 }}>{f.label}</label>
                              <input style={S.input} type="number" min="0.1" step="0.1" value={courierForm[f.key]} onChange={e => setCourierForm(p => ({ ...p, [f.key]: e.target.value }))} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Get Quote button */}
                      <button
                        type="button"
                        onClick={handleGetQuote}
                        disabled={courierLoading || (!isDropoff && !courierForm.pickup_street) || !courierForm.pickup_city || !courierForm.pickup_code || !courierForm.delivery_street || !courierForm.delivery_city || !courierForm.delivery_code}
                        style={{
                          alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8, border: 'none',
                          background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600,
                          cursor: courierLoading ? 'not-allowed' : 'pointer',
                          opacity: (courierLoading || (!isDropoff && !courierForm.pickup_street) || !courierForm.pickup_city || !courierForm.pickup_code || !courierForm.delivery_street || !courierForm.delivery_city || !courierForm.delivery_code) ? 0.5 : 1,
                          display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
                        }}
                      >
                        {courierLoading
                          ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Getting quotes…</>
                          : <><Truck size={13} /> Get Quote</>}
                      </button>

                      {/* Quote results */}
                      {courierQuotes.length > 0 && (
                        <div>
                          <label style={S.label}>Select a delivery option</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            {courierQuotes.map((q, i) => {
                              const price = q?.price ?? q?.rate ?? 0;
                              const name = q?.service_level?.name ?? q?.name ?? `Option ${i + 1}`;
                              const days = q?.service_level?.delivery_days ?? q?.delivery_days;
                              const isSelected = selectedQuote === q;
                              const chargedWeight = q?.charged_weight;
                              const actualWeight = q?.actual_weight;
                              const isVolumetric = chargedWeight && actualWeight && chargedWeight > actualWeight;
                              return (
                                <label key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                                  border: `1.5px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                                  background: isSelected ? '#eff6ff' : '#fff',
                                  transition: 'all 0.15s',
                                }}>
                                  <input type="radio" checked={isSelected} onChange={() => setSelectedQuote(q)} style={{ display: 'none' }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? '#3b82f6' : '#cbd5e1'}`, background: isSelected ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                      {days && <span style={{ fontSize: 11, color: '#94a3b8' }}>{days} business day{days !== 1 ? 's' : ''}</span>}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981', fontFamily: 'ui-monospace, monospace', display: 'block' }}>
                                      R {Number(price).toFixed(2)}
                                    </span>
                                    {isVolumetric && (
                                      <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        Volumetric: {chargedWeight}kg
                                      </span>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                </div>
              )}

              {/* Price breakdown */}
              {itemPrice >= 100 && (
                <div style={{
                  background: 'linear-gradient(135deg, #0f1729 0%, #1e293b 100%)',
                  borderRadius: 12, padding: '16px 20px', marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Item Value (held safely)</span>
                    <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#fff' }}>
                      R {itemPrice.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: courierFee > 0 ? 8 : 12 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      Buyer TrustTrade Fee
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,0.7)' }}>
                      R {buyerFeeContrib.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: courierFee > 0 ? 8 : 12 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      Seller TrustTrade Fee
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,0.7)' }}>
                      R {sellerFeeContrib.toFixed(2)}
                    </span>
                  </div>
                  {courierFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Courier Delivery</span>
                      <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,0.7)' }}>
                        + R {courierFee.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Buyer Pays Total</span>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#60a5fa' }}>
                      R {buyerPaysTotal.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Seller Receives</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#10b981' }}>
                      R {sellerPayout.toFixed(2)}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', lineHeight: 1.5 }}>
                    {feeAlloc === 'BUYER' && 'TrustTrade 2% fee is included in the buyer\'s payment. Seller receives the full item value.'}
                    {feeAlloc === 'SELLER' && 'TrustTrade 2% fee is deducted from the seller\'s payout. Buyer pays the item price only.'}
                    {feeAlloc === 'BUYER_SELLER' && 'TrustTrade 2% fee is split equally — half from buyer, half from seller payout.'}
                  </p>
                </div>
              )}

              <button
                type="button"
                style={{ ...S.btnPrimary, opacity: canProceedStep2 ? 1 : 0.45, cursor: canProceedStep2 ? 'pointer' : 'not-allowed' }}
                onClick={() => canProceedStep2 && setStep(3)}
                disabled={!canProceedStep2}
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* â"€â"€ Step 3: Photos â"€â"€ */}
          {step === 3 && (
            <div>
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={16} color="#3b82f6" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0 }}>Add Photos</h2>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Good photos build trust and prevent disputes</p>
                  </div>
                </div>

                <div style={{
                  background: '#fefce8', border: '1px solid #fde68a',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 16, marginTop: 14,
                }}>
                  <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
                    Upload <strong>1–5 clear photos</strong>. Include all angles and any defects.
                  </p>
                </div>

                <PhotoUploader photos={photos} setPhotos={setPhotos} minPhotos={1} maxPhotos={5} required={true} />
              </div>

              <button
                type="button"
                style={{ ...S.btnPrimary, opacity: canProceedStep3 ? 1 : 0.45, cursor: canProceedStep3 ? 'pointer' : 'not-allowed' }}
                onClick={() => canProceedStep3 && setStep(4)}
                disabled={!canProceedStep3}
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* â"€â"€ Step 4: Confirm â"€â"€ */}
          {step === 4 && (
            <div>
              {emailVerificationRequired && <EmailVerificationPrompt />}
              {/* Summary */}
              <div style={S.card}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 18px' }}>Review & Confirm</h2>

                {/* Parties side by side */}
                <div className="tt-party-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { roleLabel: 'Buyer', name: role === 'buyer' ? user.name : formData.buyer_name, email: role === 'buyer' ? user.email : formData.buyer_email, accent: '#3b82f6', bg: '#eff6ff', isYou: role === 'buyer' },
                    { roleLabel: 'Seller', name: role === 'seller' ? user.name : formData.seller_name, email: role === 'seller' ? user.email : formData.seller_email, accent: '#10b981', bg: '#ecfdf5', isYou: role === 'seller' },
                  ].map(p => (
                    <div key={p.roleLabel} style={{ background: p.bg, border: `1px solid ${p.accent}33`, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.accent }}>{p.roleLabel}</span>
                        {p.isYou && <span style={{ fontSize: 9, fontWeight: 600, background: p.accent, color: '#fff', padding: '1px 5px', borderRadius: 20 }}>You</span>}
                      </div>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || '—'}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '—'}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    { label: 'Item', value: formData.item_description, truncate: true },
                    { label: 'Item Value', value: `R ${itemPrice.toFixed(2)}`, mono: true },
                    ...(courierFee > 0 ? [
                      { label: 'Courier Delivery', value: `R ${courierFee.toFixed(2)}`, mono: true },
                    ] : []),
                    { label: 'Buyer TrustTrade Fee', value: `R ${buyerFeeContrib.toFixed(2)}`, mono: true },
                    { label: 'Seller TrustTrade Fee', value: `R ${sellerFeeContrib.toFixed(2)}`, mono: true },
                    { label: 'Buyer Pays Total', value: `R ${buyerPaysTotal.toFixed(2)}`, mono: true, accent: '#2563eb' },
                    { label: 'Seller Receives', value: `R ${sellerPayout.toFixed(2)}`, mono: true, accent: '#10b981' },
                    { label: 'Photos', value: `${photos.length} uploaded` },
                    { label: 'Delivery', value: formData.delivery_method.replace('_', ' ') },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{row.label}</span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: row.accent || '#0f172a',
                        fontFamily: row.mono ? 'ui-monospace, monospace' : 'inherit',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: row.truncate ? 'ellipsis' : undefined,
                        whiteSpace: row.truncate ? 'nowrap' : undefined,
                        textTransform: row.label === 'Delivery' ? 'capitalize' : undefined,
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirmations */}
              <div style={S.card}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 14px' }}>
                  Please confirm all of the following:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { key: 'buyer_details', label: 'Buyer details are accurate', testId: 'confirm-buyer-details' },
                    { key: 'seller_details', label: 'Seller details are accurate', testId: 'confirm-seller-details' },
                    { key: 'item_accuracy', label: 'Item details are accurate and complete', testId: 'confirm-item-accuracy' },
                  ].map(item => {
                    const checked = confirmations[item.key];
                    return (
                      <label
                        key={item.key}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                        data-testid={item.testId}
                        onClick={() => setConfirmations(p => ({ ...p, [item.key]: !p[item.key] }))}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          border: `2px solid ${checked ? '#10b981' : '#cbd5e1'}`,
                          background: checked ? '#10b981' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 13, color: '#374151' }}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                style={{
                  ...S.btnSuccess,
                  opacity: (loading || !confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy) ? 0.5 : 1,
                  cursor: (loading || !confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy) ? 'not-allowed' : 'pointer',
                }}
                disabled={loading || !confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy}
                data-testid="create-transaction-btn"
              >
                {loading ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Shield size={15} />
                    Create Secure Transaction
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        @media (max-width: 480px) { .tt-party-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </DashboardLayout>
  );
}

export default NewTransaction;
