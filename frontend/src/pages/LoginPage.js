import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: ''
  });

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[LOGIN_PAGE] Already authenticated, redirecting to /dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
