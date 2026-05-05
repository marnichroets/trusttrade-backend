import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import { toast } from 'sonner';
import { CreditCard, Building2, User, Hash, ShieldCheck, AlertCircle, ArrowLeft, CheckCircle, Lock, Mail } from 'lucide-react';

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
      <span style={{
        fontWeight: 600, color: V.text, fontSize: 13,
        fontFamily: mono ? V.mono : V.sans,
      }}>
        {value}
      </span>
    </div>
  );
}

function BankingSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankingStatus, setBankingStatus] = useState(null);
  const [savedBankingDetails, setSavedBankingDetails] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bankingDetails, setBankingDetails] = useState({
    bank_name: '', account_holder: '', account_number: '',
    branch_code: '', account_type: 'savings', id_number: '',
  });
  const navigate = useNavigate();

  useEffect(() => { fetchUserData(); }, []);

  const fetchUserData = async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      const statusRes = await api.get('/users/banking-details/status');
      setBankingStatus(statusRes.data);
      if (statusRes.data.banking_details_completed && userRes.data.banking_details) {
        setSavedBankingDetails(userRes.data.banking_details);
      }
      setBankingDetails(prev => ({ ...prev, account_holder: userRes.data.name }));
    } catch (error) {
      if (error.response?.status === 401) navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleBankSelect = (bankName) => {
    const bank = SA_BANKS.find(b => b.name === bankName);
    setBankingDetails(prev => ({ ...prev, bank_name: bankName, branch_code: bank?.code || prev.branch_code }));
  };

  const handleSubmit = (e) => {
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

  const handleConfirmSubmit = async () => {
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

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  const surface = { background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4, padding: '20px 24px' };

  /* ── Saved state (read-only) ── */
  if (bankingStatus?.banking_details_completed && savedBankingDetails) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <button onClick={() => navigate('/dashboard')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
            fontFamily: V.sans, fontSize: 13, marginBottom: 20,
          }}>
            <ArrowLeft size={14} /> Back to Dashboard
          </button>

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
              <p style={{ fontWeight: 600, color: V.success, fontSize: 13 }}>Banking Details Verified</p>
              <p style={{ color: V.sub, fontSize: 12, marginTop: 2 }}>Your payout account is set up</p>
            </div>
          </div>

          {/* Details */}
          <div style={{ ...surface, marginBottom: 16 }}>
            <SectionHead label="Saved Banking Details" />
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

          {/* Change notice */}
          <div style={{
            display: 'flex', gap: 12,
            background: `${V.warn}10`, border: `1px solid ${V.warn}40`,
            borderRadius: 4, padding: '14px 18px', marginBottom: 16,
          }}>
            <AlertCircle size={16} color={V.warn} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 600, color: V.warn, fontSize: 13 }}>Need to change your banking details?</p>
              <p style={{ color: V.sub, fontSize: 12, marginTop: 4 }}>
                For security reasons, banking details cannot be changed directly. Please contact our support team.
              </p>
              <a
                href="mailto:trusttrade.register@gmail.com?subject=Banking%20Details%20Change%20Request"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: V.accent, textDecoration: 'none' }}
              >
                <Mail size={12} /> Contact Support
              </a>
            </div>
          </div>

          {/* Security note */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Lock size={14} color={V.dim} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, lineHeight: 1.5 }}>
              Your full banking details are encrypted and stored securely with our payment processor.
              Only the last 4 digits of your account number are displayed for your security.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── Saved, no details loaded ── */
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
          <p style={{ color: V.sub, fontSize: 13, marginBottom: 6 }}>
            Your banking details are securely saved. Payouts will be sent to your verified account.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: V.dim, fontSize: 12, fontFamily: V.mono, marginBottom: 24 }}>
            <Lock size={12} /> Details stored securely with our payment processor
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '10px 24px', borderRadius: 4, border: 'none',
              background: V.accent, color: '#000', fontFamily: V.sans,
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  /* ── Confirmation step ── */
  if (showConfirmation) {
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <button onClick={() => setShowConfirmation(false)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
            fontFamily: V.sans, fontSize: 13, marginBottom: 20,
          }}>
            <ArrowLeft size={14} /> Edit Details
          </button>

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
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  border: `1px solid ${V.border}`, background: 'transparent',
                  color: V.text, fontFamily: V.sans, fontSize: 13, cursor: 'pointer',
                }}
              >
                Edit Details
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4, border: 'none',
                  background: saving ? V.dim : V.success,
                  color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 13,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
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

  /* ── Entry form ── */
  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <button onClick={() => navigate('/dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
          fontFamily: V.sans, fontSize: 13, marginBottom: 20,
        }}>
          <ArrowLeft size={14} /> Back
        </button>

        <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>
          Banking Details
        </h1>
        <p style={{ color: V.sub, fontSize: 13, marginBottom: 24, fontFamily: V.mono }}>
          Add your bank account to receive payouts
        </p>

        {/* Security note */}
        <div style={{
          display: 'flex', gap: 12,
          background: `${V.accent}0A`, border: `1px solid ${V.accent}30`,
          borderRadius: 4, padding: '14px 18px', marginBottom: 20,
        }}>
          <ShieldCheck size={16} color={V.accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 600, color: V.accent, fontSize: 13 }}>Secure &amp; Private</p>
            <p style={{ color: V.sub, fontSize: 12, marginTop: 4 }}>
              Your banking details are sent directly to our secure payment processor.
              TrustTrade does not store your bank account number or sensitive details.
            </p>
          </div>
        </div>

        <div style={{ ...surface, marginBottom: 16 }}>
          <SectionHead label="Bank Account" />
          <form onSubmit={handleSubmit}>

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
                width: '100%', padding: '12px', borderRadius: 4, border: 'none',
                background: saving ? V.dim : V.accent,
                color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: saving ? 'none' : `0 0 16px ${V.accent}40`,
                marginTop: 4,
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
