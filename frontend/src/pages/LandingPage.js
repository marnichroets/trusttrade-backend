import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CheckCircle, Lock, Shield, CreditCard, UserCheck, AlertTriangle, Clock, Banknote, BadgeCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import TrustLogo from '../components/TrustLogo';

function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleGetStarted = () => navigate('/login');
  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Compact Navigation */}
      <nav className="bg-white sticky top-0 z-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <TrustLogo size="default" />
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={handleGetStarted} className="text-slate-600 hover:text-slate-900 font-medium text-sm" data-testid="nav-login-btn">
                Log In
              </Button>
              <Button onClick={handleGetStarted} className="bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 h-9" data-testid="nav-signup-btn">
                Sign Up Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero - Anti-Scam Focused */}
      <section className="bg-slate-50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Left - Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-medium mb-5">
                <AlertTriangle className="w-4 h-4" />
                Stop getting scammed online
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight mb-4" data-testid="hero-headline">
                Buy or sell online
                <span className="text-blue-600"> without getting scammed</span>
              </h1>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Your money is held securely until you receive what you paid for. 
                No more trusting strangers with your hard-earned cash.
              </p>
              
              {/* Trust Points - Compact */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm">Funds only released when you confirm delivery</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm">Bank payout within 1-2 business days</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm">1.5% fee (min R5) — only pay when deal completes</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={handleGetStarted} 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 h-12 text-base btn-premium"
                  data-testid="hero-cta-btn"
                >
                  Start Secure Transaction <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  onClick={scrollToHowItWorks} 
                  className="border-slate-300 text-slate-700 px-6 h-12 text-base"
                  data-testid="hero-how-it-works-btn"
                >
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Right - Visual Trust Indicator */}
            <div className="hidden lg:block">
              <div className="bg-white rounded-xl border border-slate-200 shadow-premium-lg p-6">
                {/* Mock Transaction Card */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Shield className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">iPhone 15 Pro Max</p>
                      <p className="text-sm text-slate-500">Electronics • Used</p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
                    Funds Secured
                  </span>
                </div>
                
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Item Price</span>
                    <span className="font-mono font-semibold text-slate-900">R 18,500.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">TrustTrade Fee</span>
                    <span className="font-mono text-slate-600">R 277.50</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                    <span className="text-slate-700 font-medium">Seller Receives</span>
                    <span className="font-mono font-bold text-emerald-600">R 18,222.50</span>
                  </div>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-800">
                    <strong>Protected:</strong> Funds held in escrow until buyer confirms receipt. Payout within 1-2 business days after release.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges - Compact Strip */}
      <section className="py-6 border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10">
            <div className="flex items-center gap-2 text-slate-600">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium">256-bit Encryption</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <BadgeCheck className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">ID Verified Users</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Banknote className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium">South African Banks</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-5 w-5 text-slate-500" />
              <span className="text-sm font-medium">24hr Dispute Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Clear 4-Step Flow */}
      <section id="how-it-works" className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">How Escrow Protection Works</h2>
            <p className="text-slate-600">Simple, transparent, and secure in 4 steps</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { 
                step: "1", 
                title: "Create Deal", 
                desc: "Seller creates a secure transaction and sends a link to the buyer",
                icon: <CreditCard className="w-6 h-6" />
              },
              { 
                step: "2", 
                title: "Buyer Pays", 
                desc: "Funds are deposited and held securely in TrustTrade escrow",
                icon: <Lock className="w-6 h-6" />
              },
              { 
                step: "3", 
                title: "Item Delivered", 
                desc: "Seller ships the item. Buyer receives and inspects it",
                icon: <Shield className="w-6 h-6" />
              },
              { 
                step: "4", 
                title: "Funds Released", 
                desc: "Buyer confirms receipt. Seller paid within 1-2 business days",
                icon: <CheckCircle className="w-6 h-6" />
              }
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="bg-slate-50 rounded-xl p-5 h-full border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center mb-3 font-bold">
                    {item.step}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
                {idx < 3 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-0.5 bg-slate-200" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why TrustTrade - Problem/Solution */}
      <section className="py-16 px-4 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Why South Africans Trust TrustTrade</h2>
            <p className="text-slate-400">Built for the problems we actually face</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold mb-2">The Problem</h3>
              <p className="text-sm text-slate-400">
                You pay first, hope for the best. Seller disappears. You're left with nothing and no recourse.
              </p>
            </div>
            
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold mb-2">Our Solution</h3>
              <p className="text-sm text-slate-400">
                TrustTrade holds your money securely until you confirm you received what you paid for. Zero risk.
              </p>
            </div>
            
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold mb-2">The Result</h3>
              <p className="text-sm text-slate-400">
                Both parties are protected. Buyers get what they paid for. Sellers get paid. Everyone wins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Escrow Explanation - Clear and Direct */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-2xl p-8 sm:p-10 border border-blue-100">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Your Money Is Always Protected</h2>
                <p className="text-slate-600">Here's exactly what happens to your payment</p>
              </div>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-emerald-700 text-xs font-bold">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">Funds held in escrow</p>
                    <p className="text-sm text-slate-500">Your payment goes to a secure holding account, not directly to the seller</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-emerald-700 text-xs font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">Only released on confirmation</p>
                    <p className="text-sm text-slate-500">Seller only gets paid when you confirm the item arrived and matches description</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-emerald-700 text-xs font-bold">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">Dispute protection</p>
                    <p className="text-sm text-slate-500">Problem? Raise a dispute before release. We investigate and protect your funds</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-emerald-700 text-xs font-bold">4</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">Fast bank payout</p>
                    <p className="text-sm text-slate-500">Funds released at 10:00 and 15:00 daily. Arrives in 1-2 business days</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Urgent but Professional */}
      <section className="py-12 px-4 bg-slate-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to trade safely?</h2>
          <p className="text-slate-400 mb-6 text-lg">
            Create your first secure transaction in under 2 minutes. Free to sign up.
          </p>
          <Button 
            onClick={handleGetStarted} 
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 h-12 text-base btn-premium"
            data-testid="cta-start-btn"
          >
            Start Secure Transaction <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="bg-white py-10 px-4 border-t border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-4 gap-8 mb-8">
            <div className="sm:col-span-2">
              <div className="mb-3">
                <TrustLogo size="default" />
              </div>
              <p className="text-sm text-slate-500 max-w-xs">
                Secure escrow protection for online transactions in South Africa. Buy and sell without the scam risk.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={scrollToHowItWorks} className="text-slate-500 hover:text-slate-900">How It Works</button></li>
                <li><a href="/escrow" className="text-slate-500 hover:text-slate-900">Escrow Protection</a></li>
                <li><a href="/disputes" className="text-slate-500 hover:text-slate-900">Dispute Resolution</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/terms" className="text-slate-500 hover:text-slate-900">Terms of Service</a></li>
                <li><a href="/privacy" className="text-slate-500 hover:text-slate-900">Privacy Policy</a></li>
                <li><a href="/refund" className="text-slate-500 hover:text-slate-900">Refund Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">© 2026 TrustTrade South Africa. All rights reserved.</p>
            <a href="mailto:support@trusttradesa.co.za" className="text-sm text-slate-500 hover:text-slate-900">
              support@trusttradesa.co.za
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
