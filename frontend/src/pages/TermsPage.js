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

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-8">
          <p className="text-slate-500 text-sm">Last updated: May 2026 &nbsp;|&nbsp; Effective date: May 2026</p>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              By accessing or using the TrustTrade platform ("Service"), you agree to be bound by these Terms
              of Service ("Terms"). If you do not agree to these Terms, do not use the Service. These Terms
              constitute a legally binding agreement between you and TrustTrade (Pty) Ltd, a company
              incorporated in the Republic of South Africa ("TrustTrade", "we", "us", or "our").
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              We reserve the right to update these Terms at any time. Continued use of the Service after
              changes constitutes acceptance of the updated Terms. Users will be notified of material changes
              by email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Description of Service</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade provides an online escrow platform that facilitates secure peer-to-peer transactions
              between buyers and sellers in South Africa. Our Service holds funds on behalf of parties to a
              transaction and releases them only upon fulfilment of agreed conditions. TrustTrade acts solely
              as an intermediary and is not a party to any underlying transaction between users.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              TrustTrade partners with TradeSafe (Pty) Ltd, a registered Financial Services Provider, for the
              handling of escrow funds. TradeSafe is regulated under South African law and holds client funds
              in trust.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Eligibility</h2>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li>You must be at least 18 years of age to use the Service.</li>
              <li>You must be a resident of the Republic of South Africa or transacting in South African Rand (ZAR).</li>
              <li>You must provide accurate, current, and complete information during registration.</li>
              <li>You may not use the Service if you have been previously suspended or removed from the platform.</li>
              <li>Corporate entities may register and must provide valid company registration details.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Account Registration and Security</h2>
            <p className="text-slate-600 leading-relaxed">
              To use the Service you must create an account. You are responsible for maintaining the
              confidentiality of your login credentials and for all activities that occur under your account.
              You agree to notify us immediately at{' '}
              <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                trusttrade.register@gmail.com
              </a>{' '}
              of any unauthorised use of your account.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              We require phone number verification and banking details before you can participate in
              transactions. This is to comply with the Financial Intelligence Centre Act (FICA) and to
              protect all parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Escrow Process</h2>
            <ol className="list-decimal list-inside text-slate-600 leading-relaxed space-y-2">
              <li><strong>Transaction Creation:</strong> The buyer initiates a transaction specifying the item, amount, and terms.</li>
              <li><strong>Seller Acceptance:</strong> The seller reviews and accepts the transaction terms.</li>
              <li><strong>Funding:</strong> The buyer deposits funds into escrow via a supported payment method (EFT, card, or Ozow). Funds are held by TradeSafe.</li>
              <li><strong>Delivery:</strong> The seller delivers the goods or services as agreed.</li>
              <li><strong>Confirmation:</strong> The buyer confirms receipt and satisfaction. Funds are released to the seller within 1–3 business days.</li>
              <li><strong>Dispute:</strong> If the buyer disputes delivery, funds remain in escrow until the dispute is resolved.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Fees and Payments</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade charges a platform fee on each transaction. The fee structure is displayed at the
              time of transaction creation and may vary based on transaction size and payment method. Fees
              are non-refundable except in cases of platform error. Payment processing fees charged by
              third-party providers (EFT, card networks, Ozow) are separate and disclosed at checkout.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              All amounts are in South African Rand (ZAR). TrustTrade does not accept cryptocurrency or
              foreign currency transactions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Prohibited Uses</h2>
            <p className="text-slate-600 leading-relaxed mb-3">You may not use the Service to:</p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li>Engage in fraudulent, deceptive, or misleading transactions.</li>
              <li>Facilitate the sale of illegal goods or services under South African law.</li>
              <li>Launder money or engage in any activity that violates the Financial Intelligence Centre Act (FICA).</li>
              <li>Circumvent the escrow process by requesting off-platform payments.</li>
              <li>Create multiple accounts to abuse the platform or exploit promotions.</li>
              <li>Upload malicious software or attempt to compromise the security of the platform.</li>
              <li>Harass, threaten, or harm other users.</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-3">
              Violation of these prohibitions may result in immediate account suspension, forfeiture of
              funds held in escrow pending investigation, and referral to the South African Police Service (SAPS).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Dispute Resolution</h2>
            <p className="text-slate-600 leading-relaxed">
              If a dispute arises between buyer and seller, either party may raise a dispute within the
              platform. TrustTrade will request evidence from both parties and make a determination based
              on the information provided. TrustTrade's decision is final and binding in respect of the
              escrow funds.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              TrustTrade is not a court of law and cannot adjudicate legal claims. Where parties require
              formal legal resolution, they may pursue remedies through the National Consumer Commission,
              the Consumer Goods and Services Ombud, or the courts of the Republic of South Africa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Refunds and Cancellations</h2>
            <p className="text-slate-600 leading-relaxed">
              A transaction may be cancelled and funds refunded to the buyer if: (a) the seller has not yet
              accepted the transaction; (b) both parties agree in writing to cancel; or (c) TrustTrade
              determines a valid dispute in the buyer's favour. Refunds are subject to payment processor
              processing times (typically 3–7 business days for EFT).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Intellectual Property</h2>
            <p className="text-slate-600 leading-relaxed">
              All content, trademarks, logos, and intellectual property on the TrustTrade platform are
              owned by or licensed to TrustTrade and are protected under South African copyright and
              intellectual property law. You may not reproduce, distribute, or create derivative works
              without our express written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Limitation of Liability</h2>
            <p className="text-slate-600 leading-relaxed">
              To the maximum extent permitted by law, TrustTrade shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the Service. Our total
              aggregate liability for any claim related to the Service shall not exceed the total transaction
              fees paid by you in the 12 months preceding the claim.
            </p>
            <p className="text-slate-600 leading-relaxed mt-3">
              TrustTrade does not warrant the quality, legality, safety, or accuracy of goods or services
              offered by users. We are not liable for any loss arising from transactions between users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">12. Indemnification</h2>
            <p className="text-slate-600 leading-relaxed">
              You agree to indemnify and hold harmless TrustTrade and its officers, directors, employees,
              and agents from any claims, damages, losses, or expenses (including reasonable legal fees)
              arising from your use of the Service, your breach of these Terms, or your violation of any
              applicable law or the rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">13. Termination</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade may suspend or terminate your account at any time if you breach these Terms or if
              we reasonably suspect fraudulent activity. Upon termination, any funds legitimately owed to
              you (net of fees and dispute outcomes) will be disbursed after a 30-day holding period to
              allow for outstanding disputes and chargebacks.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">14. Governing Law and Jurisdiction</h2>
            <p className="text-slate-600 leading-relaxed">
              These Terms are governed by the laws of the Republic of South Africa. Any disputes arising
              under these Terms shall be subject to the exclusive jurisdiction of the courts of South Africa.
              These Terms are subject to the provisions of the Electronic Communications and Transactions
              Act 25 of 2002 (ECTA) and the Consumer Protection Act 68 of 2008 (CPA) where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">15. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              For questions about these Terms, contact us at{' '}
              <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                trusttrade.register@gmail.com
              </a>
              . We aim to respond within 5 business days.
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
