import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';
import { ShieldCheck, Upload, Camera, Phone, CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function IdentityVerification() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [step, setStep] = useState(1); // 1: ID, 2: Selfie, 3: Phone
  const [idFile, setIdFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
      
      // Get verification status
      const statusRes = await axios.get(`${API}/verification/status`, { withCredentials: true });
      setVerificationStatus(statusRes.data);
      
      // Set step based on verification status
      if (statusRes.data.id_verified) setStep(2);
      if (statusRes.data.selfie_verified) setStep(3);
      if (statusRes.data.phone_verified) setStep(4); // All done
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIdUpload = async () => {
    if (!idFile) {
      toast.error('Please select an ID document');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', idFile);

      await axios.post(`${API}/verification/id`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('ID document uploaded successfully');
      setStep(2);
      fetchData();
    } catch (error) {
      console.error('Failed to upload ID:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload ID');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelfieUpload = async () => {
    if (!selfieFile) {
      toast.error('Please take or select a selfie');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', selfieFile);

      await axios.post(`${API}/verification/selfie`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Selfie uploaded successfully');
      setStep(3);
      fetchData();
    } catch (error) {
      console.error('Failed to upload selfie:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload selfie');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/verification/phone/send-otp`, 
        { phone_number: phoneNumber },
        { withCredentials: true }
      );

      toast.success('OTP sent to your phone');
      setOtpSent(true);
    } catch (error) {
      console.error('Failed to send OTP:', error);
      toast.error(error.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter the 6-digit OTP');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/verification/phone/verify-otp`, 
        { phone_number: phoneNumber, otp },
        { withCredentials: true }
      );

      toast.success('Phone verified successfully! You are now a Verified User.');
      setStep(4);
      fetchData();
    } catch (error) {
      console.error('Failed to verify OTP:', error);
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const isFullyVerified = verificationStatus?.id_verified && 
                          verificationStatus?.selfie_verified && 
                          verificationStatus?.phone_verified;

  return (
    <DashboardLayout user={user}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate('/profile')} data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Profile
        </Button>

        <div className="text-center mb-8">
          <ShieldCheck className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900">Identity Verification</h1>
          <p className="text-slate-600 mt-2">
            Verify your identity to earn the Verified badge and increase your trust score
          </p>
        </div>

        {isFullyVerified ? (
          <Card className="p-8 text-center bg-green-50 border-green-200">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-900 mb-2">You're Verified!</h2>
            <p className="text-green-700 mb-4">
              Your identity has been verified. You now have the Verified badge on your profile.
            </p>
            <Badge className="bg-blue-100 text-blue-800 text-lg px-4 py-2">
              <ShieldCheck className="w-5 h-5 mr-2" />
              Verified User
            </Badge>
          </Card>
        ) : (
          <>
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step > s ? 'bg-green-500 text-white' :
                    step === s ? 'bg-primary text-white' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div className={`w-16 h-1 ${step > s ? 'bg-green-500' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: ID Upload */}
            {step === 1 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Step 1: Upload ID Document</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Upload a clear photo of your government-issued ID (ID card, passport, or driver's license)
                </p>

                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center mb-4">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdFile(e.target.files[0])}
                    className="hidden"
                    id="id-upload"
                    data-testid="id-upload-input"
                  />
                  <label htmlFor="id-upload" className="cursor-pointer">
                    <span className="text-primary font-medium">Click to upload</span>
                    <span className="text-slate-500"> or drag and drop</span>
                  </label>
                  {idFile && (
                    <p className="mt-2 text-sm text-green-600">Selected: {idFile.name}</p>
                  )}
                </div>

                <Button onClick={handleIdUpload} disabled={submitting || !idFile} className="w-full" data-testid="upload-id-btn">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload ID Document
                </Button>
              </Card>
            )}

            {/* Step 2: Selfie */}
            {step === 2 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Step 2: Take a Selfie</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Upload a clear selfie photo. Make sure your face is clearly visible.
                </p>

                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center mb-4">
                  <Camera className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) => setSelfieFile(e.target.files[0])}
                    className="hidden"
                    id="selfie-upload"
                    data-testid="selfie-upload-input"
                  />
                  <label htmlFor="selfie-upload" className="cursor-pointer">
                    <span className="text-primary font-medium">Take a selfie</span>
                    <span className="text-slate-500"> or upload a photo</span>
                  </label>
                  {selfieFile && (
                    <p className="mt-2 text-sm text-green-600">Selected: {selfieFile.name}</p>
                  )}
                </div>

                <Button onClick={handleSelfieUpload} disabled={submitting || !selfieFile} className="w-full" data-testid="upload-selfie-btn">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                  Upload Selfie
                </Button>
              </Card>
            )}

            {/* Step 3: Phone Verification */}
            {step === 3 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Step 3: Verify Phone Number</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Enter your South African phone number to receive a verification code
                </p>

                {!otpSent ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="flex gap-2">
                        <span className="flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-md text-slate-600">
                          +27
                        </span>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="81 234 5678"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                          className="rounded-l-none"
                          data-testid="phone-input"
                        />
                      </div>
                    </div>
                    <Button onClick={handleSendOtp} disabled={submitting || phoneNumber.length < 9} className="w-full" data-testid="send-otp-btn">
                      {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
                      Send Verification Code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-green-600">
                      Code sent to +27 {phoneNumber}
                    </p>
                    <div>
                      <Label htmlFor="otp">Enter 6-digit Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        placeholder="123456"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="text-center text-2xl tracking-widest"
                        data-testid="otp-input"
                      />
                    </div>
                    <Button onClick={handleVerifyOtp} disabled={submitting || otp.length !== 6} className="w-full" data-testid="verify-otp-btn">
                      {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Verify Code
                    </Button>
                    <Button variant="ghost" onClick={() => setOtpSent(false)} className="w-full">
                      Change phone number
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* Verification Benefits */}
            <Card className="p-6 bg-blue-50 border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Benefits of Verification</h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  Earn the Verified badge on your profile
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  +10 points to your Trust Score
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  Increased trust from other users
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  Priority support for disputes
                </li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default IdentityVerification;
