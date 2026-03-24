import { useState, useEffect } from 'react';
import { ShieldCheck, ArrowRight, CheckCircle, Users, Lock, Zap, Shield, Truck, CreditCard, UserCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function LandingPage() {
  const [stats, setStats] = useState({ total_transactions: 0, success_rate: 100 });

  useEffect(() => {
    axios.get(`${API}/public/stats`).then(res => setStats(res.data)).catch(() => {});
  }, []);

  const handleLogin = () => {
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin)}`;
  };

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white sticky top-0 z-50 border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-12 object-contain" />
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={handleLogin} className="text-slate-700 hover:text-blue-600 font-medium">
                Log In
              </Button>
              <Button onClick={handleLogin} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-24 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="bg-white rounded-3xl p-8 inline-block shadow-xl mb-8 border border-slate-100">
            <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-32 md:h-40 object-contain" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6">TrustTrade</h1>
          <p className="text-2xl text-blue-600 font-semibold mb-4">Secure Escrow Protection for South Africa</p>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-12">
            Protect your money when buying or selling online. Funds held securely until delivery is confirmed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={handleLogin} size="lg" className="text-lg px-8 py-6 bg-blue-600 hover:bg-blue-700 text-white shadow-lg">
              Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" onClick={scrollToHowItWorks} className="text-lg px-8 py-6 border-blue-300 text-blue-600">
              How It Works
            </Button>
          </div>
          
          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.total_transactions}+</p>
              <p className="text-sm text-slate-500">Transactions</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.success_rate}%</p>
              <p className="text-sm text-slate-500">Success Rate</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">2%</p>
              <p className="text-sm text-slate-500">Low Fee</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">24/7</p>
              <p className="text-sm text-slate-500">Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-blue-500" />
              <span className="text-sm font-medium text-slate-600">Bank-Level Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-6 w-6 text-blue-500" />
              <span className="text-sm font-medium text-slate-600">256-bit Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-blue-500" />
              <span className="text-sm font-medium text-slate-600">ID Verified Users</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-blue-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">How TrustTrade Works</h2>
            <p className="mt-4 text-lg text-slate-600">Simple, secure, and transparent</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Users, title: "Create Deal", desc: "Seller creates a transaction link and shares it with the buyer" },
              { icon: CreditCard, title: "Secure Payment", desc: "Buyer pays - funds held safely in TrustTrade escrow" },
              { icon: Truck, title: "Delivery", desc: "Seller delivers the item to the buyer" },
              { icon: CheckCircle, title: "Release Funds", desc: "Buyer confirms receipt, funds released to seller" }
            ].map((step, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center mb-4 shadow-md border border-blue-100">
                  <step.icon className="w-8 h-8 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-600 mb-2">{idx + 1}</div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-slate-600 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Why Choose TrustTrade?</h2>
            <p className="mt-4 text-lg text-slate-600">Built for South African buyers and sellers</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: "100% Secure", desc: "Your money is protected until you confirm delivery. No surprises, no scams." },
              { icon: Zap, title: "Instant Setup", desc: "Create a transaction in seconds. No paperwork, no waiting." },
              { icon: Lock, title: "Low 2% Fee", desc: "Only pay when the deal is done. No hidden charges." }
            ].map((feature, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-8 border border-slate-100 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Trade Safely?</h2>
          <p className="text-xl text-blue-100 mb-8">Join thousands of South Africans who trust TrustTrade.</p>
          <Button onClick={handleLogin} size="lg" className="text-lg px-8 py-6 bg-white text-blue-600 hover:bg-blue-50 shadow-lg">
            Create Your First Transaction <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-16 px-4 border-t border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-16 object-contain mb-4" />
              <p className="text-slate-500">Secure Escrow Protection for South Africa</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Links</h4>
              <ul className="space-y-2">
                <li><button onClick={scrollToHowItWorks} className="text-slate-500 hover:text-blue-600 text-sm">How It Works</button></li>
                <li><a href="/terms" className="text-slate-500 hover:text-blue-600 text-sm">Terms of Service</a></li>
                <li><a href="/privacy" className="text-slate-500 hover:text-blue-600 text-sm">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Contact</h4>
              <a href="mailto:support@trusttradesa.co.za" className="text-slate-500 hover:text-blue-600 text-sm">support@trusttradesa.co.za</a>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-8 text-center">
            <p className="text-slate-500 text-sm">© 2026 TrustTrade South Africa. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
