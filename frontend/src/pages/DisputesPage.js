import { Link } from 'react-router-dom';
import { ArrowLeft, Scale, AlertTriangle, CheckCircle, Clock, MessageSquare } from 'lucide-react';

export default function DisputesPage() {
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
          <Scale className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Dispute Resolution</h1>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">When to Open a Dispute</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-slate-700">Item not received after expected delivery time</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-slate-700">Item significantly different from description</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-slate-700">Item damaged or defective</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-slate-700">Seller not responding or uncooperative</p>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Dispute Process</h2>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Open Dispute</h3>
                  <p className="text-sm text-slate-600">Click "Open Dispute" on your transaction page. Describe the issue clearly and upload any evidence (photos, screenshots, messages).</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Other Party Response</h3>
                  <p className="text-sm text-slate-600">The other party has 48 hours to respond with their side of the story and evidence.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="font-semibold text-slate-900">TrustTrade Review</h3>
                  <p className="text-sm text-slate-600">Our team reviews all evidence and makes a fair determination based on the facts.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                <div>
                  <h3 className="font-semibold text-slate-900">Resolution</h3>
                  <p className="text-sm text-slate-600">Funds are released to the appropriate party based on our determination. Typical resolution time is 3-5 business days.</p>
                </div>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Tips for Successful Resolution</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <p className="text-sm text-slate-600">Provide clear photos of the item and any issues</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <p className="text-sm text-slate-600">Screenshot all communication with the other party</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <p className="text-sm text-slate-600">Keep tracking numbers and delivery receipts</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <p className="text-sm text-slate-600">Respond promptly to any requests for information</p>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Need Help?</h2>
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <MessageSquare className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-semibold text-slate-900">Contact Support</p>
                <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                  trusttrade.register@gmail.com
                </a>
              </div>
            </div>
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
