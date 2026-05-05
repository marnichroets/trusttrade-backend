import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { toast } from 'sonner';
import {
  Phone, CreditCard, Building2, User, Hash,
  ShieldCheck, CheckCircle, ArrowRight, RefreshCw, Lock
} from 'lucide-react';

const V = {
  bg:      '#0A0E14',
  surface: '#1C2128',
  border:  '#2D333B',
  accent:  '#00D1FF',
  success: '#00FFA3',
  error:   '#FF3B30',
  warn:    '#F0B429',
  text:    '#E6EDF3',
  sub:     '#8B949E',
  dim:     '#4A5568',
  mono:    "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans:    "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
};

function isValidPhone(phone) {
  const digits = phone.replace(/[\s\-\+\(\)]/g, '');
  return digits.length >= 9 && digits.length <= 12;
}

const SA_BANKS = [
  { name: 'ABSA Bank',                 code: '632005' },
  { name: 'African Bank',              code: '430000' },
  { name: 'Bidvest Bank',              code: '462005' },
  { name: 'Capitec Bank',              code: '470010' },
  { name: 'Discovery Bank',            code: '679000' },
  { name: 'First National Bank (FNB)', code: '250655' },
  { name: 'Investec Bank',             code: '580105' },
  { name: 'Nedbank',                   code: '198765' },
  { name: 'Standard Bank',            code: '051001' },
  { name: 'TymeBank',                  code: '678910' },
  { name: 'Other',                     code: '' },
];

const inputStyle = {
  width: '100%', padding: '10px 13px', borderRadius: 4,
  border: `1px solid ${V.border}`, background: '#0D1117',
  color: V.text, fontFamily: V.sans, fontSize: 13, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};

function StepDot({ num, label, active, done }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, fontFamily: V.mono,
        background: done ? V.success : active ? V.accent : 'transparent',
        border: `2px solid ${done ? V.success : active ? V.accent : V.border}`,
        color: done || active ? '#000' : V.dim,
        transition: 'all 0.2s',
      }}>
        {done ? <CheckCircle size={16} /> : num}
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: active ? V.text : V.dim, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
    </div>
  );
}

function FieldLabel({ icon: Icon, label }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: V.sub,
      fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em',
      marginBottom: 8,
    }}>
      {Icon && <Icon size={11} />} {label}
    </label>
  );
}

function Onboarding() {
  const navigate = useNavigate();
  const { setNeedsOnboarding, user } = useAuth();

  // Which top-level step: 1=phone, 2=banking, 3=done
  const [step, setStep] = useState(1);

  // Phone sub-steps
  const [phoneSubStep, setPhoneSubStep] = useState('enter'); // 'enter' | 'otp'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const otpRefs = useRef([]);

  // Banking
  const [bankingDetails, setBankingDetails] = useState({
    bank_name: '', account_holder: '', account_number: '',
    branch_code: '', account_type: 'savings',
  });
  const [bankingLoading, setBankingLoading] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setBankingDetails(prev => ({ ...prev, account_holder: prev.account_holder || user.name }));
    }
  }, [user]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  // ── Phone step ──────────────────────────────────────────────────────────────

  const handlePhoneSubmit = async () => {
    if (!isValidPhone(phone)) { toast.error('Enter a valid SA mobile number'); return; }
    setPhoneLoading(true);
    try {
      const res = await api.post('/auth/phone/submit', { phone });
      setPhone(res.data.phone || phone);
      setResendCooldown(60);
      setPhoneSubStep('otp');
      toast.success('Verification code sent!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send code');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (next.every(d => d) && next.join('').length === 6) handleOtpVerify(next.join(''));
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpVerify = async (code = otp.join('')) => {
    if (code.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/verify', { phone, otp_code: code });
      toast.success('Phone verified!');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect code');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/resend', { phone });
      setResendCooldown(60);
      setOtp(['', '', '', '', '', '']);
      toast.success('New code sent!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resend');
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Banking step ─────────────────────────────────────────────────────────────

  const handleBankSelect = (name) => {
    const bank = SA_BANKS.find(b => b.name === name);
    setBankingDetails(prev => ({ ...prev, bank_name: name, branch_code: bank?.code || prev.branch_code }));
  };

  const handleBankingSubmit = async (e) => {
    e.preventDefault();
    const { bank_name, account_number, branch_code } = bankingDetails;
    if (!bank_name || !account_number || !branch_code) {
      toast.error('Please fill in all required fields'); return;
    }
    if (account_number.length < 8) { toast.error('Enter a valid account number'); return; }
    setBankingLoading(true);
    try {
      await api.post('/users/banking-details', bankingDetails);
      toast.success('Banking details saved');
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save banking details');
    } finally {
      setBankingLoading(false);
    }
  };

  // ── Complete ─────────────────────────────────────────────────────────────────

  const handleComplete = () => {
    setNeedsOnboarding(false);
    navigate('/dashboard', { replace: true });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const card = {
    background: V.surface, border: `1px solid ${V.border}`,
    borderRadius: 6, padding: '28px 32px',
    maxWidth: 520, width: '100%', margin: '0 auto',
  };

  return (
    <div style={{ minHeight: '100vh', background: V.bg, fontFamily: V.sans, color: V.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${V.bg}; }
        .ob-input:focus { border-color: ${V.accent} !important; box-shadow: 0 0 0 2px rgba(0,209,255,0.12); }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 520, width: '100%', marginBottom: 28, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <ShieldCheck size={20} color={V.accent} />
          <span style={{ fontSize: 18, fontWeight: 700, color: V.text, letterSpacing: '-0.02em' }}>TrustTrade</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: V.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Complete your account setup
        </h1>
        <p style={{ color: V.sub, fontSize: 13, margin: 0, fontFamily: V.mono }}>
          Verify your identity to start using escrow
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ maxWidth: 520, width: '100%', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
          <StepDot num={1} label="Phone"   active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 2, background: step > 1 ? V.success : V.border, maxWidth: 80, margin: '15px 8px 0', transition: 'background 0.3s' }} />
          <StepDot num={2} label="Banking" active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 2, background: step > 2 ? V.success : V.border, maxWidth: 80, margin: '15px 8px 0', transition: 'background 0.3s' }} />
          <StepDot num={3} label="Done"    active={step === 3} done={false} />
        </div>
      </div>

      {/* ── Step 1: Phone ── */}
      {step === 1 && (
        <div style={card}>
          {phoneSubStep === 'enter' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${V.accent}12`, border: `1px solid ${V.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={18} color={V.accent} />
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: V.text, margin: 0 }}>Verify Phone Number</h2>
                  <p style={{ fontSize: 12, color: V.sub, margin: 0, fontFamily: V.mono }}>South African mobile number required</p>
                </div>
              </div>

              <FieldLabel icon={Phone} label="Mobile Number *" />
              <input
                className="ob-input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
                placeholder="0821234567"
                style={inputStyle}
              />
              <p style={{ fontSize: 11, color: V.dim, margin: '6px 0 20px', fontFamily: V.mono }}>
                Enter your SA number — we'll add +27 automatically
              </p>

              <button
                onClick={handlePhoneSubmit}
                disabled={phoneLoading || !isValidPhone(phone)}
                style={{
                  width: '100%', padding: '11px', borderRadius: 4, border: 'none',
                  background: phoneLoading || !isValidPhone(phone) ? V.dim : V.accent,
                  color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 14,
                  cursor: phoneLoading || !isValidPhone(phone) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: phoneLoading || !isValidPhone(phone) ? 'none' : `0 0 16px ${V.accent}40`,
                }}
              >
                {phoneLoading ? 'Sending…' : <><span>Send Verification Code</span><ArrowRight size={15} /></>}
              </button>

              <button
                onClick={() => { setNeedsOnboarding(false); navigate('/dashboard', { replace: true }); }}
                style={{
                  width: '100%', marginTop: 10, padding: '10px', borderRadius: 4,
                  border: `1px solid ${V.border}`, background: 'transparent',
                  color: V.sub, fontFamily: V.sans, fontSize: 13, cursor: 'pointer',
                }}
              >
                Skip for now — add phone later in Profile
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${V.success}12`, border: `1px solid ${V.success}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={18} color={V.success} />
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: V.text, margin: 0 }}>Enter Verification Code</h2>
                  <p style={{ fontSize: 12, color: V.sub, margin: 0, fontFamily: V.mono }}>Sent to {phone}</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => (otpRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    style={{
                      width: 48, height: 56, textAlign: 'center',
                      fontSize: 22, fontWeight: 700, fontFamily: V.mono,
                      borderRadius: 4, border: `1px solid ${digit ? V.accent : V.border}`,
                      background: '#0D1117', color: V.text, outline: 'none',
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => handleOtpVerify()}
                disabled={phoneLoading || otp.join('').length !== 6}
                style={{
                  width: '100%', padding: '11px', borderRadius: 4, border: 'none',
                  background: phoneLoading || otp.join('').length !== 6 ? V.dim : V.success,
                  color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 14,
                  cursor: phoneLoading || otp.join('').length !== 6 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 12,
                }}
              >
                {phoneLoading ? 'Verifying…' : 'Verify Code'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => { setPhoneSubStep('enter'); setOtp(['', '', '', '', '', '']); }}
                  style={{ background: 'none', border: 'none', color: V.sub, fontSize: 12, cursor: 'pointer', fontFamily: V.sans }}
                >
                  Change number
                </button>
                {resendCooldown > 0 ? (
                  <span style={{ fontSize: 12, color: V.dim, fontFamily: V.mono }}>Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={phoneLoading}
                    style={{ background: 'none', border: 'none', color: V.accent, fontSize: 12, cursor: 'pointer', fontFamily: V.sans, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <RefreshCw size={12} /> Resend Code
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 2: Banking ── */}
      {step === 2 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${V.accent}12`, border: `1px solid ${V.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={18} color={V.accent} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: V.text, margin: 0 }}>Add Banking Details</h2>
              <p style={{ fontSize: 12, color: V.sub, margin: 0, fontFamily: V.mono }}>Required to receive payouts</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, background: `${V.accent}0A`, border: `1px solid ${V.accent}25`, borderRadius: 4, padding: '11px 14px', marginBottom: 20 }}>
            <Lock size={13} color={V.accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>
              Encrypted and sent directly to our payment processor. TrustTrade does not store your full account number.
            </p>
          </div>

          <form onSubmit={handleBankingSubmit}>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel icon={Building2} label="Bank Name *" />
              <select
                value={bankingDetails.bank_name}
                onChange={e => handleBankSelect(e.target.value)}
                required
                style={{ ...inputStyle, height: 40, cursor: 'pointer' }}
                className="ob-input"
              >
                <option value="">Select your bank</option>
                {SA_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel icon={User} label="Account Holder Name *" />
              <input
                className="ob-input"
                value={bankingDetails.account_holder}
                onChange={e => setBankingDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                placeholder="Full name as it appears on account"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel icon={CreditCard} label="Account Number *" />
              <input
                className="ob-input"
                type="text"
                inputMode="numeric"
                value={bankingDetails.account_number}
                onChange={e => setBankingDetails(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                placeholder="Your bank account number"
                required
                style={{ ...inputStyle, fontFamily: V.mono }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel icon={Hash} label="Branch Code *" />
              <input
                className="ob-input"
                value={bankingDetails.branch_code}
                onChange={e => setBankingDetails(prev => ({ ...prev, branch_code: e.target.value }))}
                placeholder="6-digit branch code"
                required
                style={{ ...inputStyle, fontFamily: V.mono }}
              />
              {bankingDetails.bank_name && bankingDetails.bank_name !== 'Other' && (
                <p style={{ fontSize: 11, color: V.dim, margin: '4px 0 0', fontFamily: V.mono }}>
                  Universal branch code auto-filled for {bankingDetails.bank_name}
                </p>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel label="Account Type *" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[{ v: 'savings', l: 'Savings' }, { v: 'current', l: 'Current / Cheque' }].map(({ v, l }) => (
                  <label key={v} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${bankingDetails.account_type === v ? V.accent : V.border}`,
                    background: bankingDetails.account_type === v ? `${V.accent}0A` : 'transparent',
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
            </div>

            <button
              type="submit"
              disabled={bankingLoading}
              style={{
                width: '100%', padding: '11px', borderRadius: 4, border: 'none',
                background: bankingLoading ? V.dim : V.accent,
                color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 14,
                cursor: bankingLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: bankingLoading ? 'none' : `0 0 16px ${V.accent}40`,
              }}
            >
              <ShieldCheck size={15} />
              {bankingLoading ? 'Saving…' : 'Save Banking Details'}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 3: Done ── */}
      {step === 3 && (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: `${V.success}14`, border: `1px solid ${V.success}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={30} color={V.success} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: V.text, margin: '0 0 10px' }}>
            Account setup complete
          </h2>
          <p style={{ color: V.sub, fontSize: 13, margin: '0 0 28px', fontFamily: V.mono }}>
            Your phone and banking details are verified. You're ready to use TrustTrade escrow.
          </p>
          <button
            onClick={handleComplete}
            style={{
              padding: '12px 32px', borderRadius: 4, border: 'none',
              background: V.accent, color: '#000', fontFamily: V.sans,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: `0 0 16px ${V.accent}40`,
            }}
          >
            Go to Dashboard <ArrowRight size={15} />
          </button>
        </div>
      )}

      <p style={{ fontSize: 11, color: V.dim, margin: '20px 0 0', fontFamily: V.mono, textAlign: 'center' }}>
        Setup required before accessing TrustTrade
      </p>
    </div>
  );
}

export default Onboarding;
