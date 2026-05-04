import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import TrustLogo from '../components/TrustLogo';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Invalid reset link — please request a new one');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(true);
      toast.success('Password updated successfully!');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to reset password. The link may have expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/" className="inline-block mb-2">
            <TrustLogo size="large" className="mx-auto" />
          </Link>
          <p className="text-sm text-slate-500">Secure Escrow for South Africa</p>
        </div>

        <Card className="shadow-premium-lg border-slate-200">
          <CardHeader className="text-center pb-4 pt-6">
            <CardTitle className="text-xl font-bold">Reset Password</CardTitle>
            <CardDescription className="text-sm">
              Enter your new password below
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2 pb-6">
            {success ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-slate-900 mb-1">Password updated!</p>
                <p className="text-sm text-slate-500 mb-4">
                  Your password has been changed. You can now sign in with your new password.
                </p>
                <Button onClick={() => navigate('/login')} className="w-full bg-slate-900 hover:bg-slate-800">
                  Go to Sign In
                </Button>
              </div>
            ) : (
              <>
                {!token && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">
                      Invalid reset link. Please{' '}
                      <Link to="/login" className="underline font-medium">request a new one</Link>.
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium text-slate-700">New Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm" className="text-sm font-medium text-slate-700">Confirm Password</Label>
                    <Input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      className="h-10"
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !token}
                    className="w-full bg-slate-900 hover:bg-slate-800 h-10"
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating…</>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </form>

                <div className="mt-5 text-center">
                  <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Back to sign in
                  </Link>
                </div>
              </>
            )}

            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Protected with 256-bit encryption</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
