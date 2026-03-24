import { useState, useEffect } from 'react';
import { ShieldCheck, ArrowRight, CheckCircle, Users, Lock, Zap, Shield, Truck, CreditCard, UserCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function LandingPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_transactions: 0, success_rate: 100 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/public/stats`);
      setStats(response.data);
    } catch (error) {
      console.log('Stats not available');
    }
  };

  const handleLogin = () => {
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Navigation */}
      <nav className="bg-[#1a2942] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-10 object-contain" />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={handleLogin}
                data-testid="nav-login-btn"
                className="text-sm font-medium text-white hover:bg-white/10"
              >
                Log In
              </Button>
              <Button
                onClick={handleLogin}
                data-testid="nav-signup-btn"
                className="text-sm font-medium bg-[#2ecc71] hover:bg-[#27ae60] text-white"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Dark Navy */}
      <section className="bg-[#1a2942] py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-20 md:h-24 mx-auto mb-6 object-contain" />
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight mb-4">
            TrustTrade
          </h1>
          <p className="text-xl md:text-2xl text-white/80 mb-8">
            Secure Escrow Protection for South Africa
          </p>
          <p className="text-lg text-white/70 max-w-2xl mx-auto mb-10">
            Protect your money when buying or selling online. Funds held securely until delivery is confirmed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={handleLogin}
              data-testid="hero-start-transaction-btn"
              className="text-base font-semibold px-8 h-14 bg-[#2ecc71] hover:bg-[#27ae60] text-white rounded-lg"
            >
              Start a Transaction <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={scrollToHowItWorks}
              className="text-base font-semibold px-8 h-14 bg-transparent border-2 border-white text-white hover:bg-white/10 rounded-lg"
            >
              How It Works
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-white dark:bg-slate-800 py-6 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-2xl md:text-3xl font-bold text-[#1a2942] dark:text-white">
                {stats.total_transactions > 0 ? stats.total_transactions.toLocaleString() : '1,000+'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Transactions Protected</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-[#2ecc71]">100%</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Success Rate</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-[#1a2942] dark:text-white">🇿🇦</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">SA Based</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-[#1a2942] dark:text-white text-center mb-4">How It Works</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            Simple, secure, and straightforward. Complete a safe transaction in just 4 steps.
          </p>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: 1, icon: CreditCard, title: 'Create Transaction', desc: 'Buyer or seller creates a secure escrow transaction with item details' },
              { num: 2, icon: Lock, title: 'Pay Into Escrow', desc: 'Buyer pays securely. Funds held by TrustTrade until delivery confirmed' },
              { num: 3, icon: Truck, title: 'Deliver Safely', desc: 'Seller delivers the item knowing payment is guaranteed' },
              { num: 4, icon: CheckCircle, title: 'Funds Released', desc: 'Buyer confirms receipt. Funds released to seller automatically' }
            ].map((step) => (
              <div key={step.num} className="text-center p-6 rounded-xl bg-slate-50 dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-[#1a2942] rounded-full flex items-center justify-center mx-auto mb-4">
                  <step.icon className="w-8 h-8 text-white" />
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 bg-[#2ecc71] rounded-full text-white font-bold text-sm mb-3">
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold text-[#1a2942] dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why TrustTrade - Light Grey */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#f8f9fa] dark:bg-slate-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-[#1a2942] dark:text-white text-center mb-4">Why TrustTrade?</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            Built for South Africans, by South Africans. Trade with confidence.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-8 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-[#1a2942] dark:text-white mb-3">Buyer Protection</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Only pay when you're satisfied. Your money is protected until you confirm delivery of the item.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-8 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                <UserCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-[#1a2942] dark:text-white mb-3">Seller Security</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Get paid safely every time. Funds are secured before you ship, so you never have to worry.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-8 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-[#1a2942] dark:text-white mb-3">Escrow Protected</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Funds held securely until both parties are happy. Disputes resolved fairly by our team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Dark Navy */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a2942]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to trade safely?
          </h2>
          <p className="text-lg text-white/80 mb-8">
            Join thousands of South Africans trading with confidence
          </p>
          <Button
            size="lg"
            onClick={handleLogin}
            className="text-lg font-semibold px-10 h-14 bg-[#2ecc71] hover:bg-[#27ae60] text-white rounded-lg"
          >
            Start a Transaction <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer - Dark Navy */}
      <footer className="bg-[#1a2942] py-12 px-4 sm:px-6 lg:px-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-12 object-contain mb-2" />
              <p className="text-white/60 text-sm">Secure Escrow Protection for South Africa</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Links</h4>
              <ul className="space-y-2">
                <li><button onClick={scrollToHowItWorks} className="text-white/60 hover:text-white text-sm">How It Works</button></li>
                <li><a href="/terms" className="text-white/60 hover:text-white text-sm">Terms of Service</a></li>
                <li><a href="/privacy" className="text-white/60 hover:text-white text-sm">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Contact</h4>
              <ul className="space-y-2">
                <li><a href="mailto:support@trusttradesa.co.za" className="text-white/60 hover:text-white text-sm">support@trusttradesa.co.za</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center">
            <p className="text-white/60 text-sm">
              © 2026 TrustTrade South Africa. All rights reserved.
            </p>
            <p className="text-white/40 text-xs mt-2">
              Secure Escrow Protection
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
