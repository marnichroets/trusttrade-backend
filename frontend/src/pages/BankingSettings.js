import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import { toast } from 'sonner';
import { CreditCard, Building2, User, Hash, ShieldCheck, AlertCircle, ArrowLeft, CheckCircle, Lock, Clock, XCircle, Mail, Phone } from 'lucide-react';

const SA_BANKS = [
  { name: 'ABSA Bank',                  code: '632005' },
  { name: 'African Bank',               code: '430000' },
  { name: 'Bidvest Bank',               code: '462005' },
  { name: 'Capitec Bank',               code: '470010' },
  { name: 'Discovery Bank',             code: '679000' },
  { name: 'First National Bank (FNB)',  code: '250655' },
  { name: 'Investec Bank',              code: '580105' },
  { name: 'Nedbank',                    code: '198765' },
  { name: 'Standard Bank',             code: '051001' },
  { name: 'TymeBank',                   code: '678910' },
  { name: 'Other',                      code: '' },
];

function SectionHead({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: V.sub,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: V.mono, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: V.border }} />
    </div>
  );
}

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 700, color: V.sub,
        fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 8,
      }}>
        {Icon && <Icon size={12} />} {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: V.dim, marginTop: 4, fontFamily: V.mono }}>{hint}</p>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 4,
  border: `1px solid ${V.border}`, background: '#0D1117',
  color: V.text, fontFamily: V.sans, fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

function DetailRow({ icon: Icon, label, value, mono }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: `1px solid ${V.border}`,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: V.sub, fontSize: 13 }}>
        {Icon && <Icon size={14} />} {label}
      </span>
      <span style={{ fontWeight: 600, color: V.text, fontSize: 13, fontFamily: mono ? V.mono : V.sans }}>
        {value}
      </span>
    </div>
  );
}

function formatActivatesAt(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-ZA', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

function emptyBankingForm(userName = '') {
  return {
    bank_name: '', account_holder: userName, account_number: '',
    branch_code: '', account_type: 'savings', id_number: '',
  };
}

function BankingSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankingStatus, setBankingStatus] = useState(null);
  const [savedBankingDetails, setSavedBankingDetails] = useState(null);

  // Initial setup flow state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bankingDetails, setBankingDetails] = useState(emptyBankingForm());

  // Change flow state
  // changeStep: null | 'form' | 'verify' | 'cooling'
  const [changeStep, setChangeStep] = useState(null);
  const [changeDetails, setChangeDetails] = useState(emptyBankingForm());
  const [changeRequestId, setChangeRequestId] = useState(null);
  const [changeOtpChannels, setChangeOtpChannels] = useState({ email: null, sms: null });
  const [otpValue, setOtpValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingChange, setPendingChange] = useState(null); // from server status endpoint
  const [resending, setResending] = useState(false);

  const navigate = useNavigate();

  const fetchUserData = useCallback(async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      const statusRes = await api.get('/users/banking-details/status');
      setBankingStatus(statusRes.data);
      if (statusRes.data.banking_details_completed && userRes.data.banking_details) {
        setSavedBankingDetails(userRes.data.banking_details);
      }
      setBankingDetails(emptyBankingForm(userRes.data.name));
      setChangeDetails(emptyBankingForm(userRes.data.name));

      // Check for any pending change request
      if (statusRes.data.banking_details_completed) {
        try {
          const changeStatus = await api.get('/users/banking-details/change-request/status');
          if (changeStatus.data.has_pending) {
            setPendingChange(changeStatus.data);
            if (changeStatus.data.status === 'pending_verification') {
              setChangeRequestId(changeStatus.data.request_id);
            }
          } else if (changeStatus.data.just_activated) {
            toast.success('Your new banking details are now active.');
            // Reload to reflect the updated details
            const freshUser = await api.get('/auth/me');
            setSavedBankingDetails(freshUser.data.banking_details);
          }
        } catch {
          // Non-fatal — change status check failed
        }
      }
    } catch (error) {
      if (error.response?.status === 401) navigate('/');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchUserData(); }, [fetchUserData]);

  // ── Initial setup helpers ──────────────────────────────────────────────────

  const handleBankSelect = (bankName) => {
    const bank = SA_BANKS.find(b => b.name === bankName);
    setBankingDetails(prev => ({ ...prev, bank_name: bankName, branch_code: bank?.code || prev.branch_code }));
  };

  const handleSetupSubmit = (e) => {
    e.preventDefault();
    if (!bankingDetails.bank_name || !bankingDetails.account_number || !bankingDetails.branch_code) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (bankingDetails.account_number.length < 8) {
      toast.error('Please enter a valid account number');
      return;
    }
    setShowConfirmation(true);
  };

  const handleSetupConfirm = async () => {
    setSaving(true);
    try {
      await api.post('/users/banking-details', bankingDetails);
      toast.success('Banking details saved securely');
      setSavedBankingDetails({
        bank_name: bankingDetails.bank_name,
        account_holder: bankingDetails.account_holder,
        account_number: bankingDetails.account_number.slice(-4),
        branch_code: bankingDetails.branch_code,
        account_type: bankingDetails.account_type,
        updated_at: new Date().toISOString(),
      });
      setBankingStatus({ banking_details_completed: true });
      setShowConfirmation(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save banking details');
    } finally {
      setSaving(false);
    }
  };

  // ── Change flow helpers ────────────────────────────────────────────────────

  const handleChangeBankSelect = (bankName) => {
    const bank = SA_BANKS.find(b => b.name === bankName);
    setChangeDetails(prev => ({ ...prev, bank_name: bankName, branch_code: bank?.code || prev.branch_code }));
  };

  const handleChangeFormSubmit = async (e) => {
    e.preventDefault();
    if (!changeDetails.bank_name || !changeDetails.account_number || !changeDetails.branch_code) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (changeDetails.account_number.length < 8) {
      toast.error('Please enter a valid account number');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/users/banking-details/change-request', changeDetails);
      setChangeRequestId(res.data.request_id);
      setChangeOtpChannels({ email: res.data.email_sent_to, sms: res.data.sms_sent_to });
      setOtpValue('');
      setChangeStep('verify');
      toast.success('Verification code sent');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start change request');
    } finally {
      setSaving(false);
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    try {
      const res = await api.post('/users/banking-details/change-request', changeDetails);
      setChangeRequestId(res.data.request_id);
      setChangeOtpChannels({ email: res.data.email_sent_to, sms: res.data.sms_sent_to });
      setOtpValue('');
      toast.success('New verification code sent');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post('/users/banking-details/change-request/verify', {
        request_id: changeRequestId,
        otp: otpValue,
      });
      setPendingChange({
        has_pending: true,
        status: 'verified',
        activates_at: res.data.activates_at,
        new_bank_name: changeDetails.bank_name,
        new_account_last4: changeDetails.account_number.slice(-4),
      });
      setChangeStep('cooling');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Incorrect code');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancelChange = async () => {
    setCancelling(true);
    try {
      await api.delete('/users/banking-details/change-request');
      setPendingChange(null);
      setChangeStep(null);
      setChangeRequestId(null);
      setOtpValue('');
      toast.success('Change request cancelled');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  const surface = { background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4, padding: '20px 24px' };
  const btnPrimary = {
    padding: '10px 20px', borderRadius: 4, border: 'none',
    background: V.accent, color: '#000', fontFamily: V.sans,
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  };
  const btnGhost = {
    padding: '10px 20px', borderRadius: 4,
    border: `1px solid ${V.border}`, background: 'transparent',
    color: V.text, fontFamily: V.sans, fontSize: 13, cursor: 'pointer',
  };
  const btnDanger = { ...btnGhost, color: '#ef4444', borderColor: '#ef4444' };

  function BackBtn({ onClick, label = 'Back' }) {
    return (
      <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
        fontFamily: V.sans, fontSize: 13, marginBottom: 20, padding: 0,
      }}>
        <ArrowLeft size={14} /> {label}
      </button>
    );
  }

  // ── Change flow: cooling-off view ──────────────────────────────────────────
  if (changeStep === 'cooling' || (pendingChange?.status === 'verified' && changeStep === null)) {
    const info = changeStep === 'cooling' ? pendingChange : pendingChange;
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <BackBtn onClick={() => setChangeStep(null)} label="Back to Banking Details" />

          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
            Change Request Pending
          </h1>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>
            24-hour security hold in progress
          </p>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            background: `${V.warn}0F`, border: `1px solid ${V.warn}50`,
            borderRadius: 4, padding: '18px 20px', marginBottom: 16,
          }}>
            <Clock size={20} color={V.warn} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 700, color: V.warn, fontSize: 14, margin: '0 0 4px' }}>
                New details activate on {formatActivatesAt(info?.activates_at)}
              </p>
              <p style={{ color: V.sub, fontSize: 13, margin: 0 }}>
                For your security, banking detail changes require a 24-hour cooling-off period. Your existing details remain active until then.
              </p>
            </div>
          </div>

          <div style={{ ...surface, marginBottom: 16 }}>
            <SectionHead label="Pending New Details" />
            <div style={{ background: '#0D1117', borderRadius: 4, padding: '0 16px' }}>
              <DetailRow icon={Building2} label="New Bank" value={info?.new_bank_name || changeDetails.bank_name} />
              <DetailRow icon={CreditCard} label="New Account" value={`••••${info?.new_account_last4 || changeDetails.account_number.slice(-4)}`} mono />
            </div>
            <p style={{ fontSize: 11, color: V.dim, marginTop: 12, fontFamily: V.mono }}>
              An email confirmation has been sent to your registered address.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleCancelChange}
              disabled={cancelling}
              style={{ ...btnDanger, flex: 1, justifyContent: 'center', opacity: cancelling ? 0.5 : 1 }}
            >
              <XCircle size={14} /> {cancelling ? 'Cancelling…' : 'Cancel Change Request'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16 }}>
            <Lock size={14} color={V.dim} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, lineHeight: 1.5 }}>
              If you did not request this change, cancel it immediately and contact support at trusttrade.register@gmail.com.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Change flow: OTP verify view ───────────────────────────────────────────
  if (changeStep === 'verify' || (pendingChange?.status === 'pending_verification' && changeStep === null)) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <BackBtn onClick={() => { setChangeStep('form'); }} label="Edit Details" />

          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
            Verify Your Identity
          </h1>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>
            Enter the 6-digit code we sent you
          </p>

          <div style={{ ...surface, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {changeOtpChannels.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail size={14} color={V.accent} />
                  <span style={{ fontSize: 13, color: V.sub }}>Code sent to <strong style={{ color: V.text }}>{changeOtpChannels.email}</strong></span>
                </div>
              )}
              {changeOtpChannels.sms && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Phone size={14} color={V.accent} />
                  <span style={{ fontSize: 13, color: V.sub }}>SMS sent to <strong style={{ color: V.text }}>{changeOtpChannels.sms}</strong></span>
                </div>
              )}
              {!changeOtpChannels.email && !changeOtpChannels.sms && (
                <p style={{ fontSize: 13, color: V.sub }}>Check your email for the 6-digit verification code.</p>
              )}
            </div>

            <form onSubmit={handleVerifyOtp}>
              <Field label="Verification Code">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpValue}
                  onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  style={{
                    ...inputStyle,
                    fontSize: 28, fontFamily: V.mono, letterSpacing: 10,
                    textAlign: 'center', height: 56,
                  }}
                />
              </Field>

              <button
                type="submit"
                disabled={verifying || otpValue.length !== 6}
                style={{
                  ...btnPrimary,
                  width: '100%', justifyContent: 'center', marginBottom: 12,
                  opacity: (verifying || otpValue.length !== 6) ? 0.5 : 1,
                  cursor: (verifying || otpValue.length !== 6) ? 'not-allowed' : 'pointer',
                  boxShadow: `0 0 16px ${V.accent}40`,
                }}
              >
                <ShieldCheck size={15} />
                {verifying ? 'Verifying…' : 'Confirm Code'}
              </button>
            </form>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: V.dim, marginBottom: 8 }}>Didn't receive a code? Codes expire in 10 minutes.</p>
              <button
                onClick={handleResendOtp}
                disabled={resending}
                style={{ background: 'none', border: 'none', color: V.accent, fontSize: 13, cursor: 'pointer', opacity: resending ? 0.5 : 1 }}
              >
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertCircle size={14} color={V.dim} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, lineHeight: 1.5 }}>
              After verification, a 24-hour security hold applies before your new details activate.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Change flow: new details form ──────────────────────────────────────────
  if (changeStep === 'form') {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <BackBtn onClick={() => setChangeStep(null)} label="Cancel Change" />

          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
            Change Banking Details
          </h1>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>
            Enter your new bank account details
          </p>

          <div style={{
            display: 'flex', gap: 12,
            background: `${V.warn}0F`, border: `1px solid ${V.warn}40`,
            borderRadius: 4, padding: '14px 18px', marginBottom: 20,
          }}>
            <AlertCircle size={16} color={V.warn} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 600, color: V.warn, fontSize: 13, margin: '0 0 4px' }}>
                Verification required
              </p>
              <p style={{ color: V.sub, fontSize: 12, margin: 0 }}>
                A code will be sent to your email and phone. New details activate after a 24-hour security hold.
              </p>
            </div>
          </div>

          <div style={{ ...surface, marginBottom: 16 }}>
            <SectionHead label="New Bank Account" />
            <form onSubmit={handleChangeFormSubmit}>

              <Field label="Bank Name *" icon={Building2}>
                <select
                  value={changeDetails.bank_name}
                  onChange={e => handleChangeBankSelect(e.target.value)}
                  required
                  style={{ ...inputStyle, height: 38, cursor: 'pointer' }}
                >
                  <option value="">Select your bank</option>
                  {SA_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </Field>

              <Field label="Account Holder Name *" icon={User}>
                <input
                  value={changeDetails.account_holder}
                  onChange={e => setChangeDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                  placeholder="Full name as it appears on account"
                  required
                  style={inputStyle}
                />
              </Field>

              <Field label="Account Number *" icon={CreditCard}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={changeDetails.account_number}
                  onChange={e => setChangeDetails(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                  placeholder="Your new bank account number"
                  required
                  style={{ ...inputStyle, fontFamily: V.mono }}
                />
              </Field>

              <Field
                label="Branch Code *"
                icon={Hash}
                hint={changeDetails.bank_name && changeDetails.bank_name !== 'Other'
                  ? `Universal branch code auto-filled for ${changeDetails.bank_name}`
                  : undefined}
              >
                <input
                  value={changeDetails.branch_code}
                  onChange={e => setChangeDetails(prev => ({ ...prev, branch_code: e.target.value }))}
                  placeholder="6-digit branch code"
                  required
                  style={{ ...inputStyle, fontFamily: V.mono }}
                />
              </Field>

              <Field label="Account Type *">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[{ v: 'savings', l: 'Savings' }, { v: 'current', l: 'Current / Cheque' }].map(({ v, l }) => (
                    <label key={v} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${changeDetails.account_type === v ? V.accent : V.border}`,
                      background: changeDetails.account_type === v ? `${V.accent}0A` : 'transparent',
                    }}>
                      <input
                        type="radio"
                        name="change_account_type"
                        value={v}
                        checked={changeDetails.account_type === v}
                        onChange={e => setChangeDetails(prev => ({ ...prev, account_type: e.target.value }))}
                        style={{ accentColor: V.accent }}
                      />
                      <span style={{ fontSize: 13, color: V.text, fontWeight: 500 }}>{l}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...btnPrimary,
                  width: '100%', justifyContent: 'center', marginTop: 4,
                  opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: saving ? 'none' : `0 0 16px ${V.accent}40`,
                }}
              >
                <ShieldCheck size={15} />
                {saving ? 'Sending Code…' : 'Send Verification Code'}
              </button>
            </form>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Saved state (read-only with optional pending-change notice) ────────────
  if (bankingStatus?.banking_details_completed && savedBankingDetails) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <BackBtn onClick={() => navigate('/dashboard')} label="Back to Dashboard" />

          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
            Banking Details
          </h1>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>Your payout account</p>

          {/* Verified banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: `${V.success}10`, border: `1px solid ${V.success}40`,
            borderRadius: 4, padding: '14px 18px', marginBottom: 16,
          }}>
            <CheckCircle size={18} color={V.success} />
            <div>
              <p style={{ fontWeight: 600, color: V.success, fontSize: 13, margin: 0 }}>Banking Details Verified</p>
              <p style={{ color: V.sub, fontSize: 12, margin: '2px 0 0' }}>Your payout account is set up</p>
            </div>
          </div>

          {/* Pending change notice */}
          {pendingChange?.has_pending && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: `${V.warn}0F`, border: `1px solid ${V.warn}50`,
              borderRadius: 4, padding: '14px 18px', marginBottom: 16,
            }}>
              <Clock size={16} color={V.warn} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, color: V.warn, fontSize: 13, margin: '0 0 4px' }}>
                  {pendingChange.status === 'pending_verification'
                    ? 'Change request awaiting verification'
                    : `Change pending — activates ${formatActivatesAt(pendingChange.activates_at)}`}
                </p>
                <p style={{ color: V.sub, fontSize: 12, margin: '0 0 10px' }}>
                  New bank: <strong style={{ color: V.text }}>{pendingChange.new_bank_name}</strong>
                  {pendingChange.new_account_last4 && ` ••••${pendingChange.new_account_last4}`}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {pendingChange.status === 'pending_verification' && (
                    <button
                      onClick={() => setChangeStep('verify')}
                      style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }}
                    >
                      Enter Code
                    </button>
                  )}
                  {pendingChange.status === 'verified' && (
                    <button
                      onClick={() => setChangeStep('cooling')}
                      style={{ ...btnGhost, fontSize: 12, padding: '6px 14px' }}
                    >
                      View Status
                    </button>
                  )}
                  <button
                    onClick={handleCancelChange}
                    disabled={cancelling}
                    style={{ ...btnDanger, fontSize: 12, padding: '6px 14px', opacity: cancelling ? 0.5 : 1 }}
                  >
                    Cancel Change
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Current saved details */}
          <div style={{ ...surface, marginBottom: 16 }}>
            <SectionHead label="Current Banking Details" />
            <div style={{ background: '#0D1117', borderRadius: 4, padding: '0 16px' }}>
              <DetailRow icon={Building2} label="Bank Name"       value={savedBankingDetails.bank_name} />
              <DetailRow icon={User}      label="Account Holder"  value={savedBankingDetails.account_holder} />
              <DetailRow icon={CreditCard} label="Account Number" value={`••••••${savedBankingDetails.account_number}`} mono />
              <DetailRow icon={Hash}      label="Branch Code"     value={savedBankingDetails.branch_code} mono />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ color: V.sub, fontSize: 13 }}>Account Type</span>
                <span style={{ fontWeight: 600, color: V.text, fontSize: 13, textTransform: 'capitalize' }}>
                  {savedBankingDetails.account_type}
                </span>
              </div>
            </div>
            {savedBankingDetails.updated_at && (
              <p style={{ fontSize: 11, color: V.dim, marginTop: 12, fontFamily: V.mono }}>
                Last updated: {new Date(savedBankingDetails.updated_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          {/* Change button — only show if no pending request */}
          {!pendingChange?.has_pending && (
            <button
              onClick={() => setChangeStep('form')}
              style={{ ...btnPrimary, marginBottom: 16 }}
            >
              <CreditCard size={14} /> Change Banking Details
            </button>
          )}

          {/* Security note */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Lock size={14} color={V.dim} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, lineHeight: 1.5 }}>
              Your full banking details are encrypted and stored securely with our payment processor.
              Changes require email + SMS verification and a 24-hour cooling-off period.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Saved but no detail object loaded ──────────────────────────────────────
  if (bankingStatus?.banking_details_completed) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: `${V.success}18`, border: `1px solid ${V.success}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={28} color={V.success} />
          </div>
          <h2 style={{ fontFamily: V.sans, fontSize: 20, fontWeight: 700, color: V.text, marginBottom: 8 }}>
            Banking Details Verified
          </h2>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24 }}>
            Your banking details are securely saved. Payouts are processed as quickly as possible after escrow release.
          </p>
          <button onClick={() => navigate('/dashboard')} style={btnPrimary}>
            Back to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Initial setup: confirm step ────────────────────────────────────────────
  if (showConfirmation) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <BackBtn onClick={() => setShowConfirmation(false)} label="Edit Details" />

          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
            Confirm Banking Details
          </h1>
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>Please verify your information</p>

          <div style={{ ...surface, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <AlertCircle size={16} color={V.warn} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ color: V.sub, fontSize: 13 }}>
                Please verify all details are correct before submitting. Incorrect details may delay your payouts.
              </p>
            </div>

            <div style={{ background: '#0D1117', borderRadius: 4, padding: '0 16px', marginBottom: 20 }}>
              <DetailRow label="Bank Name"      value={bankingDetails.bank_name} />
              <DetailRow label="Account Holder" value={bankingDetails.account_holder} />
              <DetailRow label="Account Number" value={bankingDetails.account_number} mono />
              <DetailRow label="Branch Code"    value={bankingDetails.branch_code} mono />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ color: V.sub, fontSize: 13 }}>Account Type</span>
                <span style={{ fontWeight: 600, color: V.text, fontSize: 13, textTransform: 'capitalize' }}>
                  {bankingDetails.account_type}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirmation(false)} disabled={saving} style={{ ...btnGhost, flex: 1 }}>
                Edit Details
              </button>
              <button
                onClick={handleSetupConfirm}
                disabled={saving}
                style={{
                  ...btnPrimary, flex: 1, justifyContent: 'center',
                  opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : <><CheckCircle size={14} /> Confirm &amp; Submit</>}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Initial setup: entry form ──────────────────────────────────────────────
  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <BackBtn onClick={() => navigate('/dashboard')} label="Back" />

        <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
          Banking Details
        </h1>
        <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>
          Add your bank account to receive payouts
        </p>

        <div style={{
          display: 'flex', gap: 12,
          background: `${V.accent}0A`, border: `1px solid ${V.accent}30`,
          borderRadius: 4, padding: '14px 18px', marginBottom: 20,
        }}>
          <ShieldCheck size={16} color={V.accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 600, color: V.accent, fontSize: 13, margin: '0 0 4px' }}>Secure &amp; Private</p>
            <p style={{ color: V.sub, fontSize: 12, margin: 0 }}>
              Your banking details are sent directly to our secure payment processor.
              TrustTrade does not store your bank account number or sensitive details.
            </p>
          </div>
        </div>

        <div style={{ ...surface, marginBottom: 16 }}>
          <SectionHead label="Bank Account" />
          <form onSubmit={handleSetupSubmit}>

            <Field label="Bank Name *" icon={Building2}>
              <select
                value={bankingDetails.bank_name}
                onChange={e => handleBankSelect(e.target.value)}
                required
                style={{ ...inputStyle, height: 38, cursor: 'pointer' }}
              >
                <option value="">Select your bank</option>
                {SA_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </Field>

            <Field label="Account Holder Name *" icon={User}>
              <input
                value={bankingDetails.account_holder}
                onChange={e => setBankingDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                placeholder="Full name as it appears on account"
                required
                style={inputStyle}
              />
            </Field>

            <Field label="Account Number *" icon={CreditCard}>
              <input
                type="text"
                inputMode="numeric"
                value={bankingDetails.account_number}
                onChange={e => setBankingDetails(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                placeholder="Your bank account number"
                required
                style={{ ...inputStyle, fontFamily: V.mono }}
              />
            </Field>

            <Field
              label="Branch Code *"
              icon={Hash}
              hint={bankingDetails.bank_name && bankingDetails.bank_name !== 'Other'
                ? `Universal branch code auto-filled for ${bankingDetails.bank_name}`
                : undefined}
            >
              <input
                value={bankingDetails.branch_code}
                onChange={e => setBankingDetails(prev => ({ ...prev, branch_code: e.target.value }))}
                placeholder="6-digit branch code"
                required
                style={{ ...inputStyle, fontFamily: V.mono }}
              />
            </Field>

            <Field label="Account Type *">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[{ v: 'savings', l: 'Savings' }, { v: 'current', l: 'Current / Cheque' }].map(({ v, l }) => (
                  <label key={v} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${bankingDetails.account_type === v ? V.accent : V.border}`,
                    background: bankingDetails.account_type === v ? `${V.accent}0A` : 'transparent',
                    transition: 'border-color 0.15s',
                  }}>
                    <input
                      type="radio"
                      name="account_type"
                      value={v}
                      checked={bankingDetails.account_type === v}
                      onChange={e => setBankingDetails(prev => ({ ...prev, account_type: e.target.value }))}
                      style={{ accentColor: V.accent }}
                    />
                    <span style={{ fontSize: 13, color: V.text, fontWeight: 500 }}>{l}</span>
                  </label>
                ))}
              </div>
            </Field>

            <button
              type="submit"
              disabled={saving}
              style={{
                ...btnPrimary,
                width: '100%', justifyContent: 'center', marginTop: 4,
                opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: saving ? 'none' : `0 0 16px ${V.accent}40`,
              }}
            >
              <ShieldCheck size={15} />
              {saving ? 'Saving Securely…' : 'Save Banking Details'}
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Lock size={14} color={V.dim} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, lineHeight: 1.5 }}>
            Your banking details are encrypted and sent directly to our secure payment processor for payouts.
            TrustTrade never stores your full account number.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default BankingSettings;
