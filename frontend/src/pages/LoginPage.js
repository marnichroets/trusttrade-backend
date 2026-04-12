import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Eye, EyeOff, Loader2, Shield, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import TrustLogo from '../components/TrustLogo';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const EMERGENT_AUTH_URL = "https://auth.emergentagent.com";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(null);
  
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: ''
  });

  useEffect(() => {
    if (location.state?.error) {
      setAuthError(location.state.error);
      toast.error(location.state.error);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    setAuthError(null);
    
    try {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      // Redirect to /auth/callback which handles the #session_id extraction
      const redirectUrl = window.location.origin + '/auth/callback';
      const authUrl = `${EMERGENT_AUTH_URL}/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      console.log('[GOOGLE_AUTH] Starting Google sign-in...');
      console.log('[GOOGLE_AUTH] Auth URL:', authUrl);
      
      window.location.href = authUrl;
    } catch (error) {
      console.error('[GOOGLE_AUTH] Failed to start:', error);
      setGoogleLoading(false);
      setAuthError('Google sign-in failed. Please try again or sign in with email.');
      toast.error('Google sign-in failed. Please try again or sign in with email.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const payload = isLoginMode 
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name };
      
      const response = await api.post(endpoint, payload);
      
      const token = response.data.session_token;
      const userData = {
        user_id: response.data.user_id,
        email: response.data.email,
        name: response.data.name,
        is_admin: response.data.is_admin || false,
      };
      
      login(userData, token);
      toast.success(isLoginMode ? 'Welcome back!' : 'Account created successfully!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || 'Authentication failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-block mb-2">
            <TrustLogo size="large" className="mx-auto" />
          </Link>
          <p className="text-sm text-slate-500">Secure Escrow for South Africa</p>
        </div>
        
        <Card className="shadow-premium-lg border-slate-200">
          <CardHeader className="text-center pb-4 pt-6">
            <CardTitle className="text-xl font-bold">{isLoginMode ? 'Welcome back' : 'Create account'}</CardTitle>
            <CardDescription className="text-sm">
              {isLoginMode ? 'Sign in to manage your transactions' : 'Get started with secure escrow'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-2 pb-6">
            {/* Google Sign-In - First */}
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-200 hover:bg-slate-50 h-11 mb-4"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              data-testid="google-login-btn"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </Button>
            
            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400">or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLoginMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-slate-700">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required={!isLoginMode}
                    className="h-10"
                    data-testid="register-name"
                  />
                </div>
              )}
              
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="h-10"
                  data-testid="login-email"
                />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={6}
                    className="h-10 pr-10"
                    data-testid="login-password"
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
              
              <Button 
                type="submit" 
                className="w-full bg-slate-900 hover:bg-slate-800 h-10" 
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isLoginMode ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  isLoginMode ? 'Sign In' : 'Create Account'
                )}
              </Button>
            </form>
            
            {/* Auth Error */}
            {authError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{authError}</p>
              </div>
            )}
            
            {/* Toggle Mode */}
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setIsLoginMode(!isLoginMode)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {isLoginMode ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
            
            {/* Trust Footer */}
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Protected with 256-bit encryption</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-5 text-center text-xs text-slate-400">
          <Link to="/terms" className="hover:text-slate-600">Terms</Link>
          <span className="mx-2">•</span>
          <Link to="/privacy" className="hover:text-slate-600">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
