import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw } from 'lucide-react';
import TrustLogo from '../components/TrustLogo';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { login } = useAuth();

  const [status, setStatus] = useState(token ? 'verifying' : 'waiting'); // verifying | success | error | waiting
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const hasVerified = useRef(false);

  useEffect(() => {
    if (!token || hasVerified.current) return;
    hasVerified.current = true;

    api.post('/auth/verify-email', { token })
      .then(res => {
        const { session_token, user_id, email, name, is_admin } = res.data;
        login({ user_id, email, name, is_admin: is_admin || false }, session_token);
        setStatus('success');
        setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
      })
      .catch(err => {
        setStatus('error');
        setErrorMsg(err.response?.data?.detail || 'Verification failed. The link may have expired.');
      });
  }, [token, login, navigate]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail) { toast.error('Enter your email address'); return; }
    setResendLoading(true);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSent(true);
      setCooldown(120);
      toast.success('Verification email sent — check your inbox.');
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to send email';
      if (err.response?.status === 429) {
        toast.error(detail);
        setCooldown(120);
      } else {
        toast.error(detail);
      }
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/" className="inline-block mb-2">
            <TrustLogo size="large" className="mx-auto" />
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">

          {/* Verifying */}
          {status === 'verifying' && (
            <>
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Verifying your email…</h1>
              <p className="text-slate-500 text-sm">Just a moment.</p>
            </>
          )}

          {/* Success */}
          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Email verified!</h1>
              <p className="text-slate-500 text-sm">Redirecting you to your dashboard…</p>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Verification failed</h1>
              <p className="text-slate-500 text-sm mb-6">{errorMsg}</p>

              <form onSubmit={handleResend} className="text-left space-y-3">
                <p className="text-sm font-medium text-slate-700">Request a new verification link:</p>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  disabled={resendLoading || cooldown > 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
                >
                  {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send new verification email'}
                </button>
              </form>
            </>
          )}

          {/* Waiting (no token — came from registration) */}
          {status === 'waiting' && (
            <>
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                We sent a verification link to your email address. Click the link in the email
                to activate your account. The link expires in 24 hours.
              </p>
              <p className="text-slate-500 text-xs mb-6">Didn't get it? Check your spam folder or request a new link below.</p>

              {resendSent ? (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Verification email sent — check your inbox.
                </div>
              ) : (
                <form onSubmit={handleResend} className="text-left space-y-3">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="submit"
                    disabled={resendLoading || cooldown > 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
                  >
                    {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
                  </button>
                </form>
              )}
            </>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100">
            <Link to="/login" className="text-sm text-blue-600 hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
