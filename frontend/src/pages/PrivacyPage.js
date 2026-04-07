import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPage() {
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
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
          <p className="text-slate-500 text-sm">Last updated: April 2026</p>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Information We Collect</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade collects information you provide directly, including your name, email address, 
              phone number, and banking details for payment processing. We also collect transaction data 
              to provide our escrow services.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. How We Use Your Information</h2>
            <p className="text-slate-600 leading-relaxed">
              We use your information to facilitate secure escrow transactions, verify your identity, 
              process payments, communicate about your transactions, and comply with legal requirements.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Information Sharing</h2>
            <p className="text-slate-600 leading-relaxed">
              We share necessary transaction details with the other party in your transaction. 
              Banking information is securely transmitted to our payment processor (TradeSafe) 
              and is never stored on our servers.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Data Security</h2>
            <p className="text-slate-600 leading-relaxed">
              We implement industry-standard security measures to protect your data. All communications 
              are encrypted using SSL/TLS, and sensitive financial data is handled by PCI-compliant 
              payment processors.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Your Rights</h2>
            <p className="text-slate-600 leading-relaxed">
              You have the right to access, correct, or delete your personal information. 
              Contact us at support@trusttradesa.co.za to exercise these rights.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              For privacy-related inquiries, contact us at{' '}
              <a href="mailto:support@trusttradesa.co.za" className="text-blue-600 hover:underline">
                support@trusttradesa.co.za
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
