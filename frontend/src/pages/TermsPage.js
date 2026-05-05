import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsPage() {
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
          <FileText className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
          <p className="text-slate-500 text-sm">Last updated: April 2026</p>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              By using TrustTrade, you agree to these Terms of Service. TrustTrade provides an escrow 
              service for peer-to-peer transactions in South Africa, facilitating secure payments 
              between buyers and sellers.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Escrow Service</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade holds buyer funds in escrow until delivery is confirmed. Funds are released 
              to the seller only after the buyer confirms receipt of goods/services, or after the 
              auto-release period (48 hours) if no dispute is raised.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Fees</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade charges a 2% platform fee on all transactions. The fee may be paid by the 
              buyer, seller, or split between both parties as agreed during transaction creation. 
              Minimum transaction amount is R500.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. User Responsibilities</h2>
            <p className="text-slate-600 leading-relaxed">
              Users must provide accurate information, complete transactions in good faith, and 
              respond promptly to disputes. Fraudulent activity will result in account suspension 
              and may be reported to authorities.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Disputes</h2>
            <p className="text-slate-600 leading-relaxed">
              If a dispute arises, funds remain in escrow until resolution. TrustTrade will review 
              evidence from both parties and make a determination. Our dispute resolution process 
              is designed to be fair and transparent.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Limitation of Liability</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade is not responsible for the quality of goods/services exchanged between 
              parties. We provide escrow protection only. Our liability is limited to the transaction 
              fees collected.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              For questions about these terms, contact us at{' '}
              <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                trusttrade.register@gmail.com
              </a>
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
