import { ShieldCheck, ArrowRight, CheckCircle, Users, Lock, Zap } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function LandingPage() {
  const navigate = useNavigate();

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-32 md:h-36">
            <div className="flex items-center gap-2">
              <img 
                src="https://customer-assets.emergentagent.com/job_trust-trade-pay/artifacts/u0eeoxzq_TrustTrade%20Logo.png" 
                alt="TrustTrade" 
                className="h-28 md:h-32"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={handleLogin}
                data-testid="nav-login-btn"
                className="text-sm font-medium"
              >
                Log In
              </Button>
              <Button
                onClick={handleLogin}
                data-testid="nav-signup-btn"
                className="text-sm font-medium"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-6xl font-bold text-slate-900 tracking-tight leading-tight">
                Secure Peer-to-Peer Transactions
              </h1>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed">
                TrustTrade provides a safe escrow platform for buyers and sellers. Your funds are protected until delivery is confirmed.
              </p>
              <div className="mt-8">
                <Button
                  size="lg"
                  onClick={handleLogin}
                  data-testid="hero-start-transaction-btn"
                  className="text-base font-medium px-8 h-12 hover:scale-[1.02] transition-all duration-200 active:scale-95"
                >
                  Start Transaction <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1758599543129-5269a8f29e68?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBidXNpbmVzcyUyMGhhbmRzaGFrZXxlbnwwfHx8fDE3NzE5NDgyMDl8MA&ixlib=rb-4.1.0&q=85"
                alt="Business handshake"
                className="rounded-xl shadow-lg w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-semibold text-slate-900 text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Create Transaction</h3>
              <p className="text-sm text-slate-600">Buyer creates a transaction with item details and price</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Seller Delivers</h3>
              <p className="text-sm text-slate-600">Seller provides the product or service</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Buyer Confirms</h3>
              <p className="text-sm text-slate-600">Buyer confirms receipt and satisfaction</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">4</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Funds Released</h3>
              <p className="text-sm text-slate-600">Payment is released to the seller</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-semibold text-slate-900 text-center mb-12">Why Choose TrustTrade</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Secure Escrow</h3>
              <p className="text-slate-600">Your funds are held securely until delivery is confirmed by the buyer.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Buyer Protection</h3>
              <p className="text-slate-600">Full control over fund release. Open disputes if there are issues.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Fast & Simple</h3>
              <p className="text-slate-600">Quick setup with minimal fees. Just 2% per transaction.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ready to Start Trading Safely?</h2>
          <p className="text-xl text-blue-100 mb-8">Join TrustTrade today and experience secure peer-to-peer transactions.</p>
          <Button
            size="lg"
            variant="secondary"
            onClick={handleLogin}
            data-testid="cta-get-started-btn"
            className="text-base font-medium px-8 h-12 hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            Get Started Now <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold text-slate-900">TrustTrade</span>
          </div>
          <p className="text-sm text-slate-500">&copy; 2026 TrustTrade. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;