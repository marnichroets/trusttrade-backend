import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function RefundPage() {
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
          <RefreshCcw className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Refund Policy</h1>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
          <p className="text-slate-500 text-sm">Last updated: April 2026</p>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Escrow Refunds</h2>
            <p className="text-slate-600 leading-relaxed">
              Since TrustTrade operates as an escrow service, refunds are processed through our 
              escrow protection system. If a transaction does not complete successfully, funds 
              are returned to the buyer automatically.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. When Refunds Apply</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Item not delivered</p>
                  <p className="text-sm text-slate-600">Full refund if seller fails to deliver within agreed timeframe</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Item significantly not as described</p>
                  <p className="text-sm text-slate-600">Full or partial refund after dispute investigation</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Transaction cancelled by mutual agreement</p>
                  <p className="text-sm text-slate-600">Full refund to buyer, no fees charged</p>
                </div>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. When Refunds Do Not Apply</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <p className="text-slate-600">Buyer confirms receipt and then changes their mind</p>
              </div>
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <p className="text-slate-600">Minor differences from description that don't affect functionality</p>
              </div>
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <p className="text-slate-600">Funds already released to seller after delivery confirmation</p>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Refund Timeline</h2>
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900">Processing Time</p>
                <p className="text-sm text-slate-600">
                  Refunds are processed within 3-5 business days. Bank processing may take 
                  an additional 2-3 business days depending on your bank.
                </p>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Platform Fee Refunds</h2>
            <p className="text-slate-600 leading-relaxed">
              The 2% platform fee is only charged on successful transactions. If a refund is 
              issued before delivery confirmation, no platform fee is deducted. For partial 
              refunds after disputes, the platform fee is calculated on the final amount.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. How to Request a Refund</h2>
            <p className="text-slate-600 leading-relaxed">
              To request a refund, open a dispute on your transaction page. Provide evidence 
              and description of the issue. Our team will review and process the refund if 
              your claim is valid. For immediate assistance, contact{' '}
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
