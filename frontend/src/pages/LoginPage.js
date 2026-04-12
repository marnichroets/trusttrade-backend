import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Eye, EyeOff, Loader2, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

// Google OAuth URL - REMINDER: DO NOT HARDCODE REDIRECT URLS
const GOOGLE_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/google";

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

  // Check for error from callback
  useEffect(() => {
    if (location.state?.error) {
      setAuthError(location.state.error);
      toast.error(location.state.error);
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[LOGIN_PAGE] Already authenticated, redirecting to /dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    console.log('[GOOGLE_AUTH] Starting Google login...');
    setGoogleLoading(true);
    setAuthError(null);
    
    // Build callback URL dynamically from current location
    const currentOrigin = window.location.origin;
    const callbackUrl = `${currentOrigin}/auth/callback`;
    
    console.log('[GOOGLE_AUTH] Callback URL:', callbackUrl);
    
    // Redirect to Google OAuth
    const authUrl = `${GOOGLE_AUTH_URL}?callback_url=${encodeURIComponent(callbackUrl)}`;
    console.log('[GOOGLE_AUTH] Redirecting to:', authUrl);
    
    window.location.href = authUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[LOGIN] Submit started, isLoginMode:', isLoginMode);
    setLoading(true);
    
    try {
      const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
      const payload = isLoginMode 
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name };
      
      console.log('[LOGIN] Calling endpoint:', endpoint);
      const response = await api.post(endpoint, payload);
      console.log('[LOGIN] Response received:', response.data?.email);
      
      // Store token and user data
      const token = response.data.session_token;
      const userData = {
        user_id: response.data.user_id,
        email: response.data.email,
        name: response.data.name,
        is_admin: response.data.is_admin || false,
      };
      
      // Use the login function from AuthContext - this sets BOTH user AND isAuthenticated
      console.log('[LOGIN] Calling AuthContext login()');
      login(userData, token);
      
      toast.success(isLoginMode ? 'Welcome back!' : 'Account created successfully!');
      console.log('[LOGIN] Redirecting to /dashboard');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('[LOGIN] Failed:', error.response?.status, error.response?.data);
      const message = error.response?.data?.detail || 'Authentication failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/">
            <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-20 mx-auto mb-4" />
          </Link>
          <p className="text-slate-600">Secure Escrow for South Africa</p>
        </div>
        
        <Card className="shadow-xl border-slate-200">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">{isLoginMode ? 'Welcome Back' : 'Create Account'}</CardTitle>
            <CardDescription>
              {isLoginMode ? 'Sign in to your account' : 'Get started with TrustTrade'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLoginMode && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required={!isLoginMode}
                    data-testid="register-name"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  data-testid="login-email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={6}
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
                className="w-full bg-blue-600 hover:bg-blue-700" 
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
            
            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500">Or continue with</span>
              </div>
            </div>
            
            {/* Google Sign-In Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-300 hover:bg-slate-50"
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
            
            {/* Auth Error Display */}
            {authError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{authError}</p>
              </div>
            )}
            
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLoginMode(!isLoginMode)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {isLoginMode ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Shield className="w-4 h-4" />
                <span>Your data is protected with 256-bit encryption</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-6 text-center text-sm text-slate-500">
          <Link to="/terms" className="hover:text-blue-600">Terms</Link>
          <span className="mx-2">•</span>
          <Link to="/privacy" className="hover:text-blue-600">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
