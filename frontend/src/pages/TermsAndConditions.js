import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { ShieldCheck } from 'lucide-react';
import api, { API_URL } from '../utils/api';
import axios from 'axios';
import { toast } from 'sonner';

function TermsAndConditions() {
  const [termsContent, setTermsContent] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchTerms();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Try to get user from location state first
      if (location.state?.user) {
        setUser(location.state.user);
        return;
      }
      
      // Otherwise try to fetch from API (authenticated)
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      // Not authenticated, that's okay for terms page
      console.log('User not authenticated yet');
    }
  };

  const fetchTerms = async () => {
    try {
      // Public endpoint - use raw axios
      const response = await axios.get(`${API_URL}/terms`);
      setTermsContent(response.data.content);
    } catch (error) {
      console.error('Failed to fetch terms:', error);
    }
  };

  const handleAccept = async () => {
    if (!accepted) {
      toast.error('Please check the box to accept the terms');
      return;
    }

    if (!user) {
      toast.error('Please log in first');
      navigate('/');
      return;
    }

    setLoading(true);
    try {
      await api.post('/users/accept-terms', { accepted: true });
      toast.success('Terms accepted');
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to accept terms:', error);
      toast.error('Failed to accept terms');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-8">
          <ShieldCheck className="w-10 h-10 text-primary" />
          <h1 className="text-3xl font-bold text-slate-900">TrustTrade Terms & Conditions</h1>
        </div>

        <Card className="p-8 mb-6">
          <div className="prose prose-slate max-w-none">
            {termsContent.split('\n').map((line, index) => {
              if (line.startsWith('# ')) {
                return <h1 key={index} className="text-2xl font-bold text-slate-900 mt-6 mb-4">{line.replace('# ', '')}</h1>;
              } else if (line.startsWith('## ')) {
                return <h2 key={index} className="text-xl font-semibold text-slate-900 mt-5 mb-3">{line.replace('## ', '')}</h2>;
              } else if (line.trim()) {
                return <p key={index} className="text-slate-700 leading-relaxed mb-3">{line}</p>;
              }
              return null;
            })}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              id="accept-terms"
              checked={accepted}
              onCheckedChange={setAccepted}
              data-testid="accept-terms-checkbox"
            />
            <label htmlFor="accept-terms" className="text-sm text-slate-700 cursor-pointer">
              I have read and agree to the TrustTrade Terms & Conditions
            </label>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="flex-1"
              data-testid="decline-terms-btn"
            >
              Decline
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!accepted || loading}
              className="flex-1"
              data-testid="accept-terms-btn"
            >
              {loading ? 'Processing...' : 'Accept & Continue'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default TermsAndConditions;