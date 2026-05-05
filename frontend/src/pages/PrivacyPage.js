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

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-8">
          <p className="text-slate-500 text-sm">Last updated: May 2026 &nbsp;|&nbsp; Effective date: May 2026</p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm leading-relaxed">
              <strong>POPIA Compliance Notice:</strong> This Privacy Policy is prepared in compliance with the
              Protection of Personal Information Act 4 of 2013 (POPIA) of the Republic of South Africa. By
              using TrustTrade you consent to the processing of your personal information as described herein.
            </p>
          </div>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Responsible Party</h2>
            <p className="text-slate-600 leading-relaxed">
              The Responsible Party as defined in POPIA is TrustTrade (Pty) Ltd ("TrustTrade", "we", "us", "our").
            </p>
            <div className="mt-3 text-slate-600 space-y-1 text-sm">
              <p><strong>Information Officer:</strong> Marnich Roets</p>
              <p><strong>Email:</strong>{' '}
                <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                  trusttrade.register@gmail.com
                </a>
              </p>
              <p><strong>Country:</strong> Republic of South Africa</p>
            </div>
            <p className="text-slate-600 leading-relaxed mt-3">
              You may lodge a complaint with the Information Regulator of South Africa if you believe your
              personal information rights have been violated:{' '}
              <a href="https://www.justice.gov.za/inforeg/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                www.justice.gov.za/inforeg
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Personal Information We Collect</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              We collect only the personal information necessary to provide our escrow service. Categories include:
            </p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li><strong>Identity information:</strong> Full name, email address, profile picture (from Google sign-in).</li>
              <li><strong>Contact information:</strong> South African mobile phone number.</li>
              <li><strong>Financial information:</strong> Bank name, account holder name, account number, and branch code. We do not store your full account number — it is transmitted encrypted to our payment processor.</li>
              <li><strong>Transaction data:</strong> Details of escrow transactions you initiate or participate in, including amounts, descriptions, and counterparty information.</li>
              <li><strong>Technical data:</strong> IP address, browser type, device information, and session data, collected automatically for security and fraud prevention.</li>
              <li><strong>Communications:</strong> Messages exchanged within the platform's messaging features.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Lawful Basis for Processing (POPIA Section 11)</h2>
            <p className="text-slate-600 leading-relaxed mb-3">We process your personal information on the following grounds:</p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li><strong>Contractual necessity:</strong> Processing is necessary to fulfil our escrow service agreement with you.</li>
              <li><strong>Legal obligation:</strong> We are required to collect and retain certain information under the Financial Intelligence Centre Act (FICA), the Prevention of Organised Crime Act (POCA), and related financial regulations.</li>
              <li><strong>Legitimate interest:</strong> Fraud prevention, security monitoring, and improving our services.</li>
              <li><strong>Consent:</strong> For non-essential communications such as marketing emails, with your explicit opt-in consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Purpose of Processing</h2>
            <p className="text-slate-600 leading-relaxed mb-3">We use your personal information to:</p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li>Create and manage your TrustTrade account.</li>
              <li>Facilitate, process, and record escrow transactions.</li>
              <li>Verify your identity and comply with FICA know-your-customer (KYC) requirements.</li>
              <li>Process payments and disburse funds through TradeSafe.</li>
              <li>Send transactional email and SMS notifications (e.g., payment received, funds released).</li>
              <li>Investigate and resolve disputes between transaction parties.</li>
              <li>Detect and prevent fraud, money laundering, and other illegal activity.</li>
              <li>Comply with court orders, legal process, or requests from regulatory authorities.</li>
              <li>Improve and maintain the security and functionality of our platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Sharing of Personal Information</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              We do not sell your personal information. We share it only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li><strong>Transaction counterparty:</strong> Your name and contact details are shared with the other party to a transaction to the extent necessary to complete it.</li>
              <li><strong>TradeSafe (Pty) Ltd:</strong> Our payment processing partner. Your banking details are securely transmitted to TradeSafe for payout processing. TradeSafe is a regulated operator subject to its own privacy and FICA obligations.</li>
              <li><strong>Communication providers:</strong> We use Postmark for transactional email and a third-party SMS provider for OTP delivery. These providers process your contact details solely to send communications on our behalf.</li>
              <li><strong>Google LLC:</strong> If you use Google Sign-In, Google processes your authentication data under Google's Privacy Policy.</li>
              <li><strong>Regulatory authorities:</strong> We may disclose information to the Financial Intelligence Centre (FIC), SAPS, or other competent authorities where required by law.</li>
              <li><strong>Professional advisers:</strong> Lawyers, auditors, and insurers, subject to confidentiality obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Cross-Border Transfers</h2>
            <p className="text-slate-600 leading-relaxed">
              Some of our service providers (including cloud infrastructure and email services) may process
              data outside the Republic of South Africa. Where such transfers occur, we ensure adequate
              protection is in place consistent with POPIA Section 72, including contractual protections
              requiring equivalent standards of data protection.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Data Retention</h2>
            <p className="text-slate-600 leading-relaxed">
              We retain your personal information for as long as your account is active and for a period of
              five (5) years thereafter, as required by FICA and general financial record-keeping obligations.
              Transaction records are retained for a minimum of five years from the date of the transaction.
              You may request deletion of your account, after which non-legally-required data will be
              deleted within 30 days, subject to any outstanding disputes or legal holds.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Security</h2>
            <p className="text-slate-600 leading-relaxed">
              We implement appropriate technical and organisational measures to protect your personal
              information against unauthorised access, loss, destruction, or alteration. These include:
            </p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2 mt-3">
              <li>TLS/SSL encryption for all data in transit.</li>
              <li>Hashed and salted password storage — we never store plaintext passwords.</li>
              <li>Session token authentication with secure, HttpOnly cookies.</li>
              <li>Banking details transmitted via encrypted channels directly to our PCI-compliant payment processor.</li>
              <li>Access controls limiting staff access to personal information on a need-to-know basis.</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-3">
              In the event of a data breach that poses a risk to your rights, we will notify you and the
              Information Regulator as required by POPIA Section 22.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Cookies and Tracking</h2>
            <p className="text-slate-600 leading-relaxed">
              TrustTrade uses session cookies necessary for authentication and security. We do not use
              third-party advertising or tracking cookies. Google Fonts and Google Sign-In may set cookies
              subject to Google's Privacy Policy. You may disable cookies in your browser settings, but
              this may affect your ability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Your Rights Under POPIA</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              As a data subject under POPIA, you have the following rights:
            </p>
            <ul className="list-disc list-inside text-slate-600 leading-relaxed space-y-2">
              <li><strong>Right of access (Section 23):</strong> Request a copy of the personal information we hold about you.</li>
              <li><strong>Right to correction (Section 24):</strong> Request that inaccurate, incomplete, or outdated information be corrected.</li>
              <li><strong>Right to deletion (Section 24):</strong> Request deletion of your personal information, subject to legal retention requirements.</li>
              <li><strong>Right to object (Section 11(3)):</strong> Object to the processing of your personal information on grounds of legitimate interest.</li>
              <li><strong>Right to withdraw consent:</strong> Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.</li>
              <li><strong>Right to complain:</strong> Lodge a complaint with the Information Regulator of South Africa at{' '}
                <a href="mailto:inforeg@justice.gov.za" className="text-blue-600 hover:underline">inforeg@justice.gov.za</a>.
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-3">
              To exercise any of these rights, submit a request to{' '}
              <a href="mailto:trusttrade.register@gmail.com" className="text-blue-600 hover:underline">
                trusttrade.register@gmail.com
              </a>
              . We will respond within 30 days as required by POPIA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Children's Privacy</h2>
            <p className="text-slate-600 leading-relaxed">
              The Service is not intended for persons under the age of 18. We do not knowingly collect
              personal information from children. If we become aware that a child has provided personal
              information, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">12. Changes to This Policy</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update this Privacy Policy from time to time. Material changes will be communicated
              by email and by updating the "Last updated" date above. Continued use of the Service after
              notification constitutes acceptance of the updated Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">13. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              For privacy-related inquiries, access requests, or to exercise your POPIA rights, contact
              our Information Officer at{' '}
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
