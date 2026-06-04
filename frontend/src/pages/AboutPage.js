import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function AboutPage() {
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

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">About TrustTrade</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-5">
          <p className="text-slate-700 leading-relaxed text-lg">
            I started TrustTrade after getting scammed buying a phone on Facebook
            Marketplace. I paid R3000 and never received the item.
          </p>
          <p className="text-slate-700 leading-relaxed text-lg">
            I looked for a safe way to buy and sell online in South Africa but couldn't
            find anything simple and affordable. So I built TrustTrade — a platform that
            holds your money safely until you receive what you paid for.
          </p>
          <p className="text-slate-900 font-semibold leading-relaxed text-lg">
            No more scams. No more trust issues.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  );
}
