import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ShieldCheck, ArrowLeft } from 'lucide-react';
import { V } from '../components/DashboardLayout';

const FAQS = [
  {
    category: 'HOW IT WORKS',
    items: [
      {
        q: 'What is escrow and how does TrustTrade work?',
        a: 'Escrow is a secure holding arrangement where funds are kept by a neutral third party until both buyer and seller fulfil their obligations. When you create a transaction on TrustTrade, the buyer pays into a secure escrow account. The seller ships or delivers the item. Once the buyer confirms receipt, the funds are released to the seller — protecting both parties from fraud.',
      },
      {
        q: 'How do I start a transaction?',
        a: 'Log in and click "New Transaction". Enter the item description, price, and add the other party\'s email or TrustTrade username. Share the transaction link with your buyer or seller. The buyer pays via EFT or card — funds are held securely. Once delivery is confirmed, funds are released.',
      },
      {
        q: 'What is a Smart Deal?',
        a: 'A Smart Deal is a reusable transaction template. Instead of creating a new deal for every sale, you create one Smart Deal link that buyers can use to initiate a transaction. Ideal for sellers who sell the same item repeatedly.',
      },
      {
        q: 'Can I cancel a transaction?',
        a: 'Transactions can be cancelled before payment is made. Once funds are in escrow, cancellation requires mutual agreement or a dispute resolution. If the buyer paid but the seller never delivered, the buyer can raise a dispute and funds will be refunded after investigation.',
      },
    ],
  },
  {
    category: 'FEES & PAYMENTS',
    items: [
      {
        q: 'What are TrustTrade\'s fees?',
        a: 'TrustTrade charges a small platform fee on each completed transaction. The fee is calculated as a percentage of the transaction value and is clearly shown before you confirm. There are no hidden fees — what you see is what you pay.',
      },
      {
        q: 'Which payment methods are accepted?',
        a: 'Buyers can pay via EFT (bank transfer) or credit/debit card. All major South African banks are supported. Funds are verified before the transaction proceeds.',
      },
      {
        q: 'How long does it take to receive my payout?',
        a: 'Once the buyer confirms delivery and funds are released, payouts are processed at 10:00 and 15:00 on business days. Bank transfers typically arrive within 1–2 business days depending on your bank.',
      },
      {
        q: 'Which banks are supported for payouts?',
        a: 'All major South African banks are supported: ABSA, Standard Bank, FNB, Nedbank, Capitec, Discovery Bank, TymeBank, and African Bank. Your banking details must be verified before your first payout.',
      },
    ],
  },
  {
    category: 'SECURITY & VERIFICATION',
    items: [
      {
        q: 'Is my money safe in escrow?',
        a: 'Yes. TrustTrade uses professional escrow services to hold funds. Your money is never held directly by TrustTrade — it sits in a regulated escrow account and can only be released with your explicit confirmation or a dispute resolution decision.',
      },
      {
        q: 'Why do I need to verify my identity?',
        a: 'Identity verification is required by South African FICA (Financial Intelligence Centre Act) regulations for platforms handling financial transactions. Verification helps us prevent fraud and money laundering, and protects all users on the platform.',
      },
      {
        q: 'Why do I need to add a phone number?',
        a: 'Your phone number is used for transaction alerts and two-factor security confirmations. It also helps verify your identity as required by FICA. You can add your phone number under Settings → Verify Phone.',
      },
      {
        q: 'How is my personal data protected?',
        a: 'TrustTrade complies with the Protection of Personal Information Act (POPIA). Your data is encrypted, stored securely, and never sold to third parties. You can request access to or deletion of your data at any time. See our Privacy Policy for full details.',
      },
    ],
  },
  {
    category: 'DISPUTES',
    items: [
      {
        q: 'What happens if the item is not delivered?',
        a: 'If you\'re the buyer and the item was not delivered, do not confirm receipt. Instead, raise a dispute from the transaction page. TrustTrade will investigate and, if the claim is valid, refund the escrowed funds to you.',
      },
      {
        q: 'What happens if the item is not as described?',
        a: 'Raise a dispute before confirming delivery. Include evidence such as photos and a description of the discrepancy. TrustTrade\'s dispute team will review the evidence from both parties and make a determination within 5–7 business days.',
      },
      {
        q: 'How long does dispute resolution take?',
        a: 'Simple disputes are typically resolved within 3–5 business days. Complex disputes requiring more evidence may take up to 10 business days. You\'ll be notified by email at each stage of the process.',
      },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: `1px solid ${V.border}`,
      cursor: 'pointer',
    }}
      onClick={() => setOpen(o => !o)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', gap: 12,
      }}>
        <span style={{ fontSize: 14, color: V.text, fontWeight: 500, flex: 1 }}>{q}</span>
        {open
          ? <ChevronUp size={14} color={V.sub} style={{ flexShrink: 0 }} />
          : <ChevronDown size={14} color={V.sub} style={{ flexShrink: 0 }} />
        }
      </div>
      {open && (
        <div style={{ padding: '0 20px 16px', fontSize: 13, color: V.sub, lineHeight: 1.65 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: V.bg, color: V.text, fontFamily: V.sans }}>
      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${V.border}`,
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none',
            color: V.sub, fontSize: 12, cursor: 'pointer',
            fontFamily: V.mono, letterSpacing: '0.06em',
          }}
        >
          <ArrowLeft size={12} /> BACK
        </button>
        <div style={{ width: 1, height: 16, background: V.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={14} color={V.accent} />
          <span style={{ fontSize: 12, color: V.sub, fontFamily: V.mono, letterSpacing: '0.08em' }}>
            TRUSTTRADE
          </span>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 32px' }}>
        <p style={{ fontSize: 10, color: V.accent, fontFamily: V.mono, letterSpacing: '0.2em', margin: '0 0 12px' }}>
          HELP CENTER
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: V.text, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
          Frequently Asked Questions
        </h1>
        <p style={{ fontSize: 15, color: V.sub, margin: 0, lineHeight: 1.6 }}>
          Everything you need to know about secure escrow with TrustTrade.
        </p>
      </div>

      {/* FAQ sections */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {FAQS.map(section => (
          <div key={section.category}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: V.sub,
              fontFamily: V.mono, letterSpacing: '0.15em',
              margin: '0 0 12px',
            }}>
              {section.category}
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${V.border}`,
              borderRadius: 4, overflow: 'hidden',
            }}>
              {section.items.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        ))}

        {/* Still need help */}
        <div style={{
          background: 'rgba(0,209,255,0.04)',
          border: `1px solid rgba(0,209,255,0.2)`,
          borderRadius: 4, padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: V.text, margin: '0 0 4px' }}>
              Still need help?
            </p>
            <p style={{ fontSize: 13, color: V.sub, margin: 0 }}>
              Email us at{' '}
              <a href="mailto:trusttrade.register@gmail.com" style={{ color: V.accent, textDecoration: 'none' }}>
                trusttrade.register@gmail.com
              </a>
            </p>
          </div>
          <a
            href="mailto:trusttrade.register@gmail.com"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '8px 18px', borderRadius: 3,
              border: `1px solid rgba(0,209,255,0.3)`,
              background: 'rgba(0,209,255,0.08)',
              color: V.accent, fontSize: 13, fontWeight: 600,
              textDecoration: 'none', fontFamily: V.sans,
            }}
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
