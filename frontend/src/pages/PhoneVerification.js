import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import api from '../utils/api';
import { toast } from 'sonner';
import { Phone, Shield, CheckCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

function PhoneVerification() {
  const [step, setStep] = useState('phone'); // 'phone', 'otp', 'success'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const navigate = useNavigate();
  const otpRefs = useRef([]);

  useEffect(() => {
    // Check current verification status
    checkVerificationStatus();
  }, []);

  useEffect(() => {
    // Countdown timer for resend
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const checkVerificationStatus = async () => {
    try {
      const response = await api.get('/auth/phone/status');
      setVerificationStatus(response.data);
      
      if (response.data.phone_verified) {
        setStep('success');
      } else if (response.data.phone) {
        setPhone(response.data.phone);
        if (!response.data.can_resend) {
          setResendCooldown(response.data.resend_cooldown_remaining);
          setStep('otp');
        }
      }
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };

  const formatPhoneDisplay = (value) => {
    // Format for display: +27 82 123 4567
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('27')) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
    }
    return value;
  };

  const handlePhoneChange = (e) => {
    let value = e.target.value;
    // Allow only digits and + sign
    value = value.replace(/[^\d+]/g, '');
    setPhone(value);
  };

  const handlePhoneSubmit = async () => {
    if (!phone || phone.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/phone/submit', { phone });

      toast.success('Verification code sent!');
      setPhone(response.data.phone);
      setResendCooldown(60);
      setStep('otp');
    } catch (error) {
      console.error('Phone submit error:', error);
      toast.error(error.response?.data?.detail || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newOtp.every(d => d !== '') && newOtp.join('').length === 6) {
      handleOtpVerify(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpVerify = async (otpCode = otp.join('')) => {
    if (otpCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/phone/verify', { phone, otp_code: otpCode });

      toast.success('Phone number verified!');
      setStep('success');
    } catch (error) {
      console.error('OTP verify error:', error);
      toast.error(error.response?.data?.detail || 'Incorrect code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    try {
      await api.post('/auth/phone/resend', { phone });

      toast.success('New verification code sent!');
      setResendCooldown(60);
      setOtp(['', '', '', '', '', '']);
    } catch (error) {
      console.error('Resend error:', error);
      toast.error(error.response?.data?.detail || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 bg-white">
        {step === 'phone' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Verify Your Phone</h1>
              <p className="text-slate-600">
                Enter your South African mobile number to receive a verification code.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Mobile Number</Label>
                <div className="relative">
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="0821234567 or 821234567"
                    className="text-lg"
                    data-testid="phone-input"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your SA number (e.g. 0821234567). We'll add +27 automatically.
                </p>
              </div>

              <Button
                onClick={handlePhoneSubmit}
                disabled={loading || phone.length < 9}
                className="w-full"
                data-testid="send-code-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Enter Verification Code</h1>
              <p className="text-slate-600">
                We sent a 6-digit code to <br />
                <span className="font-medium text-slate-900">{formatPhoneDisplay(phone)}</span>
              </p>
            </div>

            <div className="space-y-6">
              {/* OTP Input */}
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => (otpRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold"
                    data-testid={`otp-input-${index}`}
                  />
                ))}
              </div>

              <Button
                onClick={() => handleOtpVerify()}
                disabled={loading || otp.join('').length !== 6}
                className="w-full"
                data-testid="verify-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </Button>

              {/* Resend */}
              <div className="text-center">
                {resendCooldown > 0 ? (
                  <p className="text-sm text-slate-500">
                    Resend code in <span className="font-medium">{resendCooldown}s</span>
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={handleResend}
                    disabled={loading}
                    className="text-blue-600"
                    data-testid="resend-btn"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resend Code
                  </Button>
                )}
              </div>

              {/* Change Number */}
              <Button
                variant="outline"
                onClick={() => {
                  setStep('phone');
                  setOtp(['', '', '', '', '', '']);
                }}
                className="w-full"
              >
                Change Phone Number
              </Button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Phone Verified!</h1>
              <p className="text-slate-600">
                Your phone number has been verified successfully.
              </p>
              <p className="text-sm text-slate-500 mt-2">
                {formatPhoneDisplay(phone || verificationStatus?.phone || '')}
              </p>
            </div>

            <Button
              onClick={handleContinue}
              className="w-full"
              data-testid="continue-btn"
            >
              Continue to Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          By verifying your phone, you agree to receive SMS notifications about your transactions.
        </p>
      </Card>
    </div>
  );
}

export default PhoneVerification;
