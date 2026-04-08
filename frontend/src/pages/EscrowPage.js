import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Lock, CheckCircle, Clock } from 'lucide-react';

export default function EscrowPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-slate-600 hover:text-blue-600">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </nav>
      
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Escrow Protection</h1>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">What is Escrow?</h2>
            <p className="text-slate-600 leading-relaxed">
              Escrow is a secure payment method where a trusted third party (TrustTrade) holds the 
              buyer's payment until both parties fulfill their obligations. This protects buyers from 
              fraud and sellers from non-payment.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">How TrustTrade Escrow Works</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Create Transaction</h3>
                  <p className="text-sm text-slate-600">Buyer or seller creates a transaction with item details and price</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Buyer Pays</h3>
                  <p className="text-sm text-slate-600">Buyer pays into TrustTrade escrow via EFT, card, or Ozow</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Seller Delivers</h3>
                  <p className="text-sm text-slate-600">Seller ships or delivers the item knowing payment is secured</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Funds Released</h3>
                  <p className="text-sm text-slate-600">Buyer confirms receipt, funds released to seller</p>
                </div>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Key Benefits</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Secure Payments</h3>
                  <p className="text-sm text-slate-600">Funds held securely until delivery confirmed</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Fraud Protection</h3>
                  <p className="text-sm text-slate-600">Reduces risk for both buyers and sellers</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-900">Auto-Release</h3>
                  <p className="text-sm text-slate-600">Funds auto-release after 48 hours if no dispute raised</p>
                </div>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Fees</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade charges a <strong>2% platform fee</strong> on all transactions. 
              Minimum transaction amount is <strong>R500</strong>. 
              The fee can be paid by buyer, seller, or split between both parties.
            </p>
          </section>
        </div>
      </main>
      
      <footer className="bg-white border-t border-slate-200 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm">© 2026 TrustTrade South Africa. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
