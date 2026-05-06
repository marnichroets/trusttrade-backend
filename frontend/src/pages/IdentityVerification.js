import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import { toast } from 'sonner';
import { ShieldCheck, Upload, Camera, Phone, CheckCircle, ArrowLeft, FileText, X } from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const isValidSAPhone = (p) => p.replace(/\D/g, '').length >= 9;

function SectionHead({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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

function StepDot({ num, active, done }) {
  const color = done ? V.success : active ? V.accent : V.dim;
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      border: `2px solid ${color}`,
      background: done ? `${V.success}18` : active ? `${V.accent}18` : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
    }}>
      {done
        ? <CheckCircle size={14} color={V.success} />
        : <span style={{ fontFamily: V.mono, fontSize: 12, fontWeight: 700, color }}>{num}</span>
      }
    </div>
  );
}

function DropZone({ id, icon: Icon, title, subtitle, onChange, accept, capture, testId }) {
  return (
    <label htmlFor={id} style={{ display: 'block', cursor: 'pointer' }}>
      <input type="file" accept={accept} capture={capture} onChange={onChange}
             style={{ display: 'none' }} id={id} data-testid={testId} />
      <div style={{
        border: `2px dashed ${V.border}`, borderRadius: 4, padding: '32px 20px',
        textAlign: 'center', transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = V.accent}
        onMouseLeave={e => e.currentTarget.style.borderColor = V.border}
      >
        <Icon size={32} color={V.sub} style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, color: V.text, marginBottom: 4 }}>
          <span style={{ color: V.accent, fontWeight: 600 }}>{title}</span>
        </p>
        <p style={{ fontSize: 12, color: V.sub }}>{subtitle}</p>
      </div>
    </label>
  );
}

function FilePreview({ file, preview, onClear, progress, submitting }) {
  return (
    <div style={{
      background: '#0D1117', border: `1px solid ${V.border}`,
      borderRadius: 4, padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {preview
          ? <img src={preview} alt="Preview" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, border: `1px solid ${V.border}` }} />
          : <div style={{ width: 56, height: 56, background: V.surface, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={24} color={V.sub} />
            </div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, color: V.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </p>
          <p style={{ fontSize: 11, color: V.sub, fontFamily: V.mono }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <CheckCircle size={12} color={V.success} />
            <span style={{ fontSize: 11, color: V.success }}>Ready to upload</span>
          </div>
        </div>
        <button onClick={onClear} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: V.sub, padding: 4,
        }}>
          <X size={16} />
        </button>
      </div>
      {submitting && progress > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 3, background: V.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: V.accent, width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <p style={{ fontSize: 11, color: V.sub, fontFamily: V.mono, textAlign: 'center', marginTop: 4 }}>{progress}% uploaded</p>
        </div>
      )}
    </div>
  );
}

function IdentityVerification() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [step, setStep] = useState(1);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const navigate = useNavigate();

  const handleIdFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!valid.includes(file.type)) { toast.error('Please upload a valid photo (JPG, PNG) or PDF file'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('File size must be less than 5MB'); return; }
    setIdFile(file);
    if (file.type.startsWith('image/')) {
      const r = new FileReader();
      r.onloadend = () => setIdPreview(r.result);
      r.readAsDataURL(file);
    } else { setIdPreview(null); }
  };

  const handleSelfieFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload a photo for your selfie'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('File size must be less than 5MB'); return; }
    setSelfieFile(file);
    const r = new FileReader();
    r.onloadend = () => setSelfiePreview(r.result);
    r.readAsDataURL(file);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      const statusRes = await api.get('/verification/status');
      setVerificationStatus(statusRes.data);
      if (statusRes.data.id_verified) setStep(2);
      if (statusRes.data.selfie_verified) setStep(3);
      if (statusRes.data.phone_verified) setStep(4);
    } catch (error) {
      if (error.response?.status === 401) navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleIdUpload = async () => {
    if (!idFile) { toast.error('Please select an ID document'); return; }
    setSubmitting(true); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', idFile);
      await api.post('/verification/id', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
      });
      toast.success('ID document uploaded successfully!');
      setStep(2); setIdFile(null); setIdPreview(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to upload ID'); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const handleSelfieUpload = async () => {
    if (!selfieFile) { toast.error('Please take or select a selfie'); return; }
    setSubmitting(true); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', selfieFile);
      await api.post('/verification/selfie', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
      });
      toast.success('Selfie uploaded successfully!');
      setStep(3); setSelfieFile(null); setSelfiePreview(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to upload selfie'); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const handleSendOtp = async () => {
    if (!phoneNumber || !isValidSAPhone(phoneNumber)) { toast.error('Please enter a valid phone number'); return; }
    setSubmitting(true);
    try {
      await api.post('/verification/phone/send-otp', { phone_number: phoneNumber });
      toast.success('OTP sent to your phone');
      setOtpSent(true);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to send OTP'); }
    finally { setSubmitting(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) { toast.error('Please enter the 6-digit OTP'); return; }
    setSubmitting(true);
    try {
      await api.post('/verification/phone/verify-otp', { phone_number: phoneNumber, otp });
      toast.success('Phone verified! You are now a Verified User.');
      setStep(4); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Invalid OTP'); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  const isFullyVerified = verificationStatus?.id_verified &&
                          verificationStatus?.selfie_verified &&
                          verificationStatus?.phone_verified;

  const surface = { background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4, padding: '20px 24px' };

  const btnPrimary = (disabled) => ({
    width: '100%', padding: '11px', borderRadius: 4, border: 'none',
    background: disabled ? V.dim : V.accent, color: '#000',
    fontFamily: V.sans, fontWeight: 700, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: disabled ? 'none' : `0 0 12px ${V.accent}40`,
  });

  const inputStyle = {
    padding: '9px 12px', borderRadius: 4,
    border: `1px solid ${V.border}`, background: '#0D1117',
    color: V.text, fontFamily: V.sans, fontSize: 13, outline: 'none',
  };

  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        <button onClick={() => navigate('/profile')} data-testid="back-btn" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
          fontFamily: V.sans, fontSize: 13, marginBottom: 20,
        }}>
          <ArrowLeft size={14} /> Back to Profile
        </button>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: `${V.accent}18`, border: `1px solid ${V.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <ShieldCheck size={26} color={V.accent} />
          </div>
          <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, marginBottom: 8 }}>
            Identity Verification
          </h1>
          <p style={{ color: V.sub, fontSize: 13 }}>
            Verify your identity to earn the Verified badge and increase your trust score
          </p>
        </div>

        {isFullyVerified ? (
          <div style={{
            ...surface, textAlign: 'center',
            background: `${V.success}0A`, border: `1px solid ${V.success}40`,
          }}>
            <CheckCircle size={40} color={V.success} style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontFamily: V.sans, fontSize: 20, fontWeight: 700, color: V.success, marginBottom: 8 }}>
              You're Verified!
            </h2>
            <p style={{ color: V.sub, fontSize: 13, marginBottom: 20 }}>
              Your identity has been verified. You now have the Verified badge on your profile.
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 4,
              color: V.accent, background: `${V.accent}18`, border: `1px solid ${V.accent}40`,
              fontFamily: V.mono, fontWeight: 700, fontSize: 13,
            }}>
              <ShieldCheck size={14} /> Verified User
            </span>
          </div>
        ) : (
          <>
            {/* Progress stepper */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                  <StepDot num={s} active={step === s} done={step > s} />
                  {s < 3 && (
                    <div style={{ width: 48, height: 2, background: step > s ? V.success : V.border }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 72, marginBottom: 24 }}>
              {['ID Document', 'Selfie', 'Phone'].map((l, i) => (
                <span key={l} style={{ fontSize: 11, color: step === i + 1 ? V.accent : V.sub, fontFamily: V.mono }}>
                  {l}
                </span>
              ))}
            </div>

            {/* Step 1: ID Upload */}
            {step === 1 && (
              <div style={{ ...surface, marginBottom: 16 }}>
                <SectionHead label="Step 1 — Upload Your ID" />
                <p style={{ color: V.sub, fontSize: 13, marginBottom: 16 }}>
                  Upload a clear photo or PDF of your government-issued ID (ID card, passport, or driver's license).
                </p>
                {!idFile ? (
                  <DropZone
                    id="id-upload" icon={Upload}
                    title="Click to upload" subtitle="JPG, PNG, or PDF • Max 5MB"
                    onChange={handleIdFileSelect}
                    accept="image/*,application/pdf"
                    testId="id-upload-input"
                  />
                ) : (
                  <FilePreview
                    file={idFile} preview={idPreview}
                    onClear={() => { setIdFile(null); setIdPreview(null); }}
                    progress={uploadProgress} submitting={submitting}
                  />
                )}
                <button
                  onClick={handleIdUpload}
                  disabled={submitting || !idFile}
                  data-testid="upload-id-btn"
                  style={{ ...btnPrimary(submitting || !idFile), marginTop: 16 }}
                >
                  <Upload size={14} />
                  {submitting ? 'Uploading…' : 'Upload ID Document'}
                </button>
              </div>
            )}

            {/* Step 2: Selfie */}
            {step === 2 && (
              <div style={{ ...surface, marginBottom: 16 }}>
                <SectionHead label="Step 2 — Take a Selfie" />
                <p style={{ color: V.sub, fontSize: 13, marginBottom: 16 }}>
                  Take a clear selfie photo. Make sure your face is clearly visible and well-lit.
                </p>
                {!selfieFile ? (
                  <DropZone
                    id="selfie-upload" icon={Camera}
                    title="Take a selfie" subtitle="JPG or PNG • Max 5MB • Opens front camera on mobile"
                    onChange={handleSelfieFileSelect}
                    accept="image/*" capture="user"
                    testId="selfie-upload-input"
                  />
                ) : (
                  <FilePreview
                    file={selfieFile} preview={selfiePreview}
                    onClear={() => { setSelfieFile(null); setSelfiePreview(null); }}
                    progress={uploadProgress} submitting={submitting}
                  />
                )}
                <button
                  onClick={handleSelfieUpload}
                  disabled={submitting || !selfieFile}
                  data-testid="upload-selfie-btn"
                  style={{ ...btnPrimary(submitting || !selfieFile), marginTop: 16 }}
                >
                  <Camera size={14} />
                  {submitting ? 'Uploading…' : 'Upload Selfie'}
                </button>
              </div>
            )}

            {/* Step 3: Phone */}
            {step === 3 && (
              <div style={{ ...surface, marginBottom: 16 }}>
                <SectionHead label="Step 3 — Verify Phone Number" />
                <p style={{ color: V.sub, fontSize: 13, marginBottom: 16 }}>
                  Enter your South African phone number to receive a verification code.
                </p>
                {!otpSent ? (
                  <>
                    <div style={{ display: 'flex', marginBottom: 12 }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', padding: '0 12px',
                        background: '#0D1117', border: `1px solid ${V.border}`,
                        borderRight: 'none', borderRadius: '4px 0 0 4px',
                        color: V.sub, fontSize: 13, fontFamily: V.mono,
                      }}>
                        +27
                      </span>
                      <input
                        type="tel"
                        placeholder="81 234 5678"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        data-testid="phone-input"
                        maxLength={10}
                        style={{ ...inputStyle, flex: 1, borderRadius: '0 4px 4px 0', width: '100%' }}
                      />
                    </div>
                    <button
                      onClick={handleSendOtp}
                      disabled={submitting || !isValidSAPhone(phoneNumber)}
                      data-testid="send-otp-btn"
                      style={btnPrimary(submitting || !isValidSAPhone(phoneNumber))}
                    >
                      <Phone size={14} />
                      {submitting ? 'Sending…' : 'Send Verification Code'}
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ color: V.success, fontSize: 13, marginBottom: 12, fontFamily: V.mono }}>
                      Code sent to +27 {phoneNumber}
                    </p>
                    <input
                      type="text"
                      placeholder="123456"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      data-testid="otp-input"
                      style={{
                        ...inputStyle, width: '100%', textAlign: 'center',
                        fontSize: 24, letterSpacing: '0.3em', marginBottom: 12,
                        boxSizing: 'border-box', fontFamily: V.mono,
                      }}
                    />
                    <button
                      onClick={handleVerifyOtp}
                      disabled={submitting || otp.length !== 6}
                      data-testid="verify-otp-btn"
                      style={{ ...btnPrimary(submitting || otp.length !== 6), marginBottom: 10 }}
                    >
                      <CheckCircle size={14} />
                      {submitting ? 'Verifying…' : 'Verify Code'}
                    </button>
                    <button
                      onClick={() => setOtpSent(false)}
                      style={{
                        width: '100%', padding: '9px', borderRadius: 4,
                        border: `1px solid ${V.border}`, background: 'transparent',
                        color: V.sub, fontFamily: V.sans, fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      Change phone number
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Benefits */}
            <div style={{
              background: `${V.accent}08`, border: `1px solid ${V.accent}25`,
              borderRadius: 4, padding: '16px 20px',
            }}>
              <p style={{ fontWeight: 700, color: V.accent, fontSize: 13, marginBottom: 12 }}>
                Benefits of Verification
              </p>
              {[
                'Earn the Verified badge on your profile',
                '+10 points to your Trust Score',
                'Increased trust from other users',
                'Priority support for disputes',
              ].map(b => (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CheckCircle size={13} color={V.accent} />
                  <span style={{ fontSize: 13, color: V.sub }}>{b}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default IdentityVerification;
