import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Banknote, Truck, Shield, ShieldCheck, User, Package,
  CreditCard, CheckCircle, CheckCircle2, Loader2, RefreshCw, Mail,
  MessageSquare, Sparkles, AlertTriangle,
} from 'lucide-react';
import TrustTradeLogo from '../components/TrustTradeLogo';
import PaymentConfirmModal from '../components/PaymentConfirmModal';

/*
 * /demo — a fully interactive, click-through simulation of the real TrustTrade
 * escrow flow. NO real payments, no API calls. It reuses the exact dark theme,
 * fonts, card styles, badges and buttons from the production app so a first-time
 * visitor learns the real interface before signing up.
 */

// Palette — identical to components/DashboardLayout.js `V`.
const V = {
  bg: '#0D1117', surface: '#161B22', hover: '#1C2128', border: '#30363D',
  accent: '#2F81F4', success: '#3FB950', error: '#F85149', warn: '#D29922',
  text: '#E6EDF3', sub: '#8B949E', dim: '#6E7681',
  mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
};

const ITEM_CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'sports', label: 'Sports & Outdoor' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];

const CONDITIONS = ['New', 'Used', 'Used - Minor Defects', 'Used - Major Defects', 'Sold As-Is'];

// Estimated bank arrival date — mirrors backend email_service.estimated_payout_arrival:
// before 10:00 → next business day, else the day after; weekends roll to Monday.
function estimatedPayoutArrival(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + (d.getHours() < 10 ? 1 : 2));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtArrival(d) {
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function rand(v) { return `R ${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function randTight(v) {
  const n = Math.round(Number(v || 0) * 100) / 100;
  return Math.abs(n - Math.round(n)) < 0.005 ? `R${n.toLocaleString('en-ZA')}` : `R${n.toFixed(2)}`;
}

const S = {
  card: { background: V.surface, borderRadius: 14, border: `1px solid ${V.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', padding: '22px 24px', marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: V.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  input: { width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: `1px solid ${V.border}`, fontSize: 13, color: V.text, background: V.surface, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: {
    width: '100%', height: 40, padding: '0 32px 0 12px', borderRadius: 8, border: `1px solid ${V.border}`,
    fontSize: 13, color: V.text, background: V.surface, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  },
  btnPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 44, borderRadius: 10, border: 'none', background: V.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSuccess: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 44, borderRadius: 10, border: 'none', background: V.success, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  actionCard: (color, bg) => ({ background: bg, border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`, borderRadius: 14, padding: '20px 22px', marginBottom: 14 }),
  pill: (bg, color) => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: bg, color }),
};

const STEP_LABELS = ['Create', 'Confirm', 'Pay', 'Secured', 'Release', 'Paid'];

// Demo personas
const SELLER = { name: 'Thabo Mokoena', email: 'thabo.m@gmail.com', phone: '+27 83 412 7790', trust: { score: 96, trades: 23, disputes: 0 }, bank: 'First National Bank (FNB)' };
const BUYER = { name: 'Jaco van der Merwe', email: 'jaco.vdm@gmail.com', phone: '+27 82 555 0142', trust: { score: 98, trades: 14, disputes: 0 } };

export default function DemoPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    item_name: 'iPhone 14 Pro — 256GB, Space Black',
    price: '12500',
    category: 'electronics',
    condition: 'Used - Minor Defects',
    delivery_method: 'courier',
    buyer_email: BUYER.email,
    buyer_phone: BUYER.phone,
  });
  const [pm, setPm] = useState(null);          // selected payment method
  const [showPayModal, setShowPayModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waybill] = useState(() => `TTC${Math.floor(100000000 + Math.random() * 900000000)}`);

  // Inject the brand fonts (same as the authenticated app).
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  const price = parseFloat(form.price) || 0;
  const isCourier = form.delivery_method === 'courier';
  const courierFee = isCourier ? 95 : 0;
  const platformFee = Math.round(Math.max(price * 0.02, 5) * 100) / 100;
  const buyerBase = Math.round((price + courierFee + platformFee) * 100) / 100;   // before bank processing fee
  const sellerPayout = price;                                                      // buyer pays the fee → seller gets full item value
  const arrival = useMemo(() => fmtArrival(estimatedPayoutArrival()), []);

  // Bank processing rates per the demo spec (EFT free, card +2.5%, Ozow +1.7%).
  const PM_FEE_PCT = { eft: 0, card: 2.5, ozow: 1.7 };
  const feePct = pm ? PM_FEE_PCT[pm] : 0;
  const r = feePct / 100;
  const estTotal = r > 0 ? Math.round((buyerBase / (1 - r)) * 100) / 100 : buyerBase;
  const estFee = Math.round((estTotal - buyerBase) * 100) / 100;

  const reset = () => { setStep(1); setPm(null); setShowPayModal(false); };

  const advance = (to) => { setBusy(true); setTimeout(() => { setBusy(false); setStep(to); }, 650); };

  const viewpoint = step === 1 ? 'Seller' : step === 4 ? 'Seller' : step === 6 ? 'Seller' : 'Buyer';

  return (
    <div style={{ minHeight: '100vh', background: V.bg, color: V.text, fontFamily: V.sans }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${V.bg}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes demoPop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes demoFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes demoPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        .demo-fade { animation: demoFade 0.35s ease both; }
        .demo-input:focus { border-color: ${V.accent} !important; box-shadow: 0 0 0 2px rgba(47,129,244,0.18); }
        .demo-opt:hover { border-color: ${V.accent}88 !important; }
        @media (max-width: 560px) { .demo-step-label { display: none !important; } .demo-hide-sm { display: none !important; } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${V.border}; border-radius: 4px; }
      `}</style>

      {/* ── Demo banner ── */}
      <div style={{ background: 'linear-gradient(90deg, rgba(47,129,244,0.18), rgba(63,185,80,0.14))', borderBottom: `1px solid ${V.border}`, padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, textAlign: 'center', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(6px)' }}>
        <Sparkles size={14} color={V.accent} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: V.text }}>This is a demo — no real payments are processed.</span>
      </div>

      {/* ── Top bar (mirrors the app chrome) ── */}
      <header style={{ borderBottom: `1px solid ${V.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: V.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: V.sub, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            <ArrowLeft size={16} /> Back to Home
          </button>
          <div role="button" tabIndex={0} onClick={() => navigate('/')} style={{ cursor: 'pointer' }} className="demo-hide-sm">
            <TrustTradeLogo size="medium" showText dark />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...S.pill('rgba(47,129,244,0.14)', '#60A5FA'), fontFamily: V.mono, letterSpacing: '0.04em' }}>{viewpoint}'s view</span>
          <button onClick={() => navigate('/login')} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${V.border}`, background: 'transparent', color: V.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign in
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '26px 16px 90px' }}>

        {/* ── Stepper ── */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          {STEP_LABELS.map((label, idx) => {
            const num = idx + 1;
            const done = step > num;
            const active = step === num;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < STEP_LABELS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: done ? V.success : active ? V.accent : V.border, color: done || active ? '#fff' : V.sub, transition: 'all 0.2s' }}>
                    {done ? <CheckCircle size={14} /> : num}
                  </div>
                  <span className="demo-step-label" style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? V.text : V.sub, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                {idx < STEP_LABELS.length - 1 && (
                  <div style={{ flex: 1, height: 2, margin: '0 8px', background: step > num ? V.success : V.border, transition: 'background 0.3s', minWidth: 10 }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="demo-fade" key={step}>
          {step === 1 && <StepCreate form={form} setForm={setForm} onNext={() => advance(2)} busy={busy} />}
          {step === 2 && <StepBuyerConfirm form={form} price={price} platformFee={platformFee} courierFee={courierFee} buyerBase={buyerBase} onBack={() => setStep(1)} onNext={() => advance(3)} busy={busy} />}
          {step === 3 && (
            <StepPayment
              form={form} price={price} platformFee={platformFee} courierFee={courierFee} buyerBase={buyerBase}
              pm={pm} setPm={setPm} feePct={feePct} estFee={estFee} estTotal={estTotal}
              onPay={() => setShowPayModal(true)} onBack={() => setStep(2)} busy={busy}
            />
          )}
          {step === 4 && <StepFundsSecured form={form} buyerBase={buyerBase} estTotal={estTotal} isCourier={isCourier} waybill={waybill} arrival={arrival} onNext={() => advance(5)} busy={busy} />}
          {step === 5 && <StepConfirmReceipt form={form} sellerPayout={sellerPayout} onNext={() => advance(6)} busy={busy} />}
          {step === 6 && <StepPaid form={form} sellerPayout={sellerPayout} arrival={arrival} onRestart={reset} onSignup={() => navigate('/login')} />}
        </div>

        {/* Restart link (always available except final celebration which has its own) */}
        {step !== 6 && (
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <button onClick={reset} style={{ background: 'none', border: 'none', color: V.dim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={11} /> Restart demo
            </button>
          </div>
        )}
      </div>

      {/* Styled confirmation modal — the exact component the real app uses. */}
      <PaymentConfirmModal
        open={showPayModal}
        amount={estTotal}
        processingFee={estFee}
        onConfirm={() => { setShowPayModal(false); advance(4); }}
        onCancel={() => setShowPayModal(false)}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 1 — Seller creates the transaction
 * ──────────────────────────────────────────────────────────────────────── */
function StepCreate({ form, setForm, onNext, busy }) {
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const price = parseFloat(form.price) || 0;
  const canProceed = form.item_name && price >= 100 && form.category && form.condition && form.buyer_email;
  return (
    <div>
      <div style={S.card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: V.text, margin: '0 0 4px' }}>What are you selling?</h2>
        <p style={{ fontSize: 13, color: V.sub, margin: '0 0 18px' }}>Create a secure escrow transaction — the buyer's money is held safely until they confirm receipt.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Item Name</label>
            <input className="demo-input" style={S.input} value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. iPhone 14 Pro — 256GB" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>Category</label>
              <select style={S.select} value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Select...</option>
                {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Condition</label>
              <select style={S.select} value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="">Select...</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={S.label}>Price (R)</label>
            <input className="demo-input" style={{ ...S.input, fontFamily: V.mono, fontWeight: 600 }} type="number" min="100" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
            <p style={{ fontSize: 11, color: V.sub, margin: '5px 0 0' }}>TrustTrade charges a 2% platform fee (min R5).</p>
          </div>
        </div>
      </div>

      {/* Delivery method */}
      <div style={S.card}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.text, margin: '0 0 14px' }}>How will the item be delivered?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { value: 'bank_deposit', icon: Banknote, label: 'In-Person Meeting — meet to exchange', desc: 'Payment is released once the handover is confirmed.' },
            { value: 'courier', icon: Truck, label: 'Courier Guy — we book delivery for you', desc: 'Buyer confirms receipt before payment is released.' },
          ].map(opt => {
            const active = form.delivery_method === opt.value;
            return (
              <label key={opt.value} className="demo-opt" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${active ? V.accent : V.border}`, background: active ? 'rgba(47,129,244,0.14)' : V.bg, cursor: 'pointer', transition: 'all 0.15s' }}>
                <input type="radio" checked={active} onChange={() => set('delivery_method', opt.value)} style={{ display: 'none' }} />
                <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? V.accent : V.border}`, background: active ? V.accent : V.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <opt.icon size={15} color={active ? V.accent : V.sub} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: V.text }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: V.sub, display: 'block', marginTop: 1 }}>{opt.desc}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Buyer details */}
      <div style={S.card}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.text, margin: '0 0 12px' }}>Buyer Details</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={S.label}>Buyer Email</label>
            <input className="demo-input" style={S.input} value={form.buyer_email} onChange={e => set('buyer_email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label style={S.label}>Buyer Phone</label>
            <input className="demo-input" style={S.input} value={form.buyer_phone} onChange={e => set('buyer_phone', e.target.value)} placeholder="+27..." />
            <p style={{ fontSize: 11, color: V.sub, margin: '5px 0 0' }}>They'll receive a secure link to review and pay.</p>
          </div>
        </div>
      </div>

      <button onClick={() => canProceed && onNext()} disabled={!canProceed || busy} style={{ ...S.btnPrimary, opacity: canProceed && !busy ? 1 : 0.5, cursor: canProceed && !busy ? 'pointer' : 'not-allowed' }}>
        {busy ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating…</> : <>Create Transaction <ArrowRight size={15} /></>}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 2 — Buyer reviews & confirms the fee agreement
 * ──────────────────────────────────────────────────────────────────────── */
function StepBuyerConfirm({ form, price, platformFee, courierFee, buyerBase, onBack, onNext, busy }) {
  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: V.sub, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(63,185,80,0.14)', color: '#34D399', padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          <ShieldCheck size={15} /> This transaction is protected by TrustTrade escrow
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: V.text, margin: '0 0 4px' }}>You've been invited to a transaction</h2>
        <p style={{ fontSize: 13, color: V.sub, margin: 0 }}>Review the details below, then confirm to continue to payment.</p>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={S.pill('rgba(245,158,11,0.14)', '#FBBF24')}>Pending Buyer Confirmation</span>
          <span style={{ fontSize: 12, color: V.sub, fontFamily: V.mono }}>TT-DEMO-4821</span>
        </div>

        {/* Item */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: V.sub, marginBottom: 6 }}>
            <Package size={14} /> Item
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: V.text, margin: '0 0 8px' }}>{form.item_name}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {form.condition && <span style={S.pill(V.border, V.sub)}>{form.condition}</span>}
            <span style={S.pill('rgba(47,129,244,0.14)', '#60A5FA')}>{form.delivery_method === 'courier' ? 'Courier Guy' : 'In-Person Meeting'}</span>
          </div>
        </div>

        {/* Parties with trust scores */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            { title: 'Buyer', color: '#2F81F4', bg: 'rgba(47,129,244,0.14)', name: BUYER.name, t: BUYER.trust },
            { title: 'Seller', color: '#f97316', bg: 'rgba(245,158,11,0.14)', name: SELLER.name, t: SELLER.trust },
          ].map(p => (
            <div key={p.title} style={{ background: V.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${V.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={13} color={p.color} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: V.text }}>{p.title}</span>
                <CheckCircle2 size={13} color={V.success} style={{ marginLeft: 'auto' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: V.text, margin: '0 0 4px' }}>{p.name}</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: V.text, margin: 0 }} title="Trust score · completed trades · valid disputes">
                {p.t.score} trust · {p.t.trades} trades · {p.t.disputes} disputes
              </p>
            </div>
          ))}
        </div>

        {/* Deal summary */}
        <div style={{ background: V.bg, border: `1px solid ${V.border}`, borderRadius: 12, padding: '16px 18px' }}>
          <p style={{ ...S.label, marginBottom: 12 }}>Deal Summary</p>
          <Row label="Item Value (held in escrow)" value={rand(price)} />
          {courierFee > 0 && <Row label="Courier Delivery" value={rand(courierFee)} />}
          <Row label="TrustTrade Platform Fee (2%)" value={rand(platformFee)} />
          <div style={{ borderTop: `1px solid ${V.border}`, paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: V.text }}>Buyer Pays Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: V.accent, fontFamily: V.mono }}>{rand(buyerBase)}</span>
          </div>
          <p style={{ fontSize: 11, color: V.sub, margin: '8px 0 0', lineHeight: 1.5 }}>The seller receives the full item value. A small bank processing fee may apply at checkout depending on your payment method.</p>
        </div>
      </div>

      <button onClick={() => !busy && onNext()} disabled={busy} style={{ ...S.btnSuccess, opacity: busy ? 0.6 : 1 }}>
        {busy ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Confirming…</> : <><Shield size={15} /> Confirm Fee Agreement</>}
      </button>
      <p style={{ fontSize: 12, color: V.sub, textAlign: 'center', marginTop: 10 }}>By confirming you agree to the item details and the 2% TrustTrade fee.</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 3 — Buyer selects a payment method
 * ──────────────────────────────────────────────────────────────────────── */
function StepPayment({ form, price, platformFee, courierFee, buyerBase, pm, setPm, feePct, estFee, estTotal, onPay, onBack, busy }) {
  const methods = [
    { id: 'eft', emoji: '🏦', label: 'EFT Bank Transfer', desc: 'Direct bank transfer', badge: 'Recommended', feeNote: 'No extra bank fee' },
    { id: 'card', emoji: '💳', label: 'Credit / Debit Card', desc: 'Pay instantly with Visa or Mastercard', feeNote: '+2.5% bank processing fee' },
    { id: 'ozow', emoji: '⚡', label: 'Ozow Instant EFT', desc: 'Fast instant payment from your bank app', feeNote: '+1.7% bank processing fee' },
  ];
  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: V.sub, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ ...S.card, padding: '22px 24px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(47,129,244,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CreditCard size={18} color={V.accent} />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: V.text, margin: '0 0 3px' }}>Secure Payment</p>
            <p style={{ fontSize: 13, color: V.sub, margin: 0 }}>Your payment is protected — the seller receives funds only after you confirm receipt.</p>
          </div>
        </div>

        {/* Methods */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {methods.map(m => {
            const sel = pm === m.id;
            return (
              <div key={m.id} onClick={() => setPm(m.id)} style={{ border: `1.5px solid ${sel ? V.accent : V.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', background: sel ? 'rgba(47,129,244,0.14)' : V.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? V.accent : V.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <div style={{ width: 10, height: 10, borderRadius: '50%', background: V.accent }} />}
                  </div>
                  <span style={{ fontSize: 20 }}>{m.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: V.text }}>{m.label}</span>
                      {m.badge && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(63,185,80,0.14)', color: '#34D399', padding: '1px 7px', borderRadius: 20 }}>{m.badge}</span>}
                    </div>
                    <span style={{ fontSize: 12, color: V.sub, display: 'block' }}>{m.desc}</span>
                    <span style={{ fontSize: 11, color: V.dim, display: 'block', marginTop: 2 }}>{m.feeNote}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment breakdown — updates dynamically with the selected method */}
        <div style={{ background: V.bg, border: `1px solid ${V.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
          <p style={{ ...S.label, marginBottom: 12 }}>Payment Breakdown</p>
          <Row label="Item Value (held securely)" value={rand(price)} />
          <Row label="TrustTrade Platform Fee (2%)" value={rand(platformFee)} />
          {courierFee > 0 && <Row label="Courier Delivery" value={rand(courierFee)} />}
          {feePct > 0 && <Row label={`Bank processing fee (${feePct}%)`} value={rand(estFee)} />}
          <div style={{ borderTop: `1px solid ${V.border}`, paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: V.text }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: V.success }}>{rand(estTotal)}</span>
          </div>
          <p style={{ fontSize: 11, color: V.sub, marginTop: 8, lineHeight: 1.5 }}>
            {feePct > 0 ? 'The exact bank fee is confirmed before you pay.' : 'No extra bank fee for EFT.'} TrustTrade's 2% platform fee is included — the seller receives the full item value.
          </p>
        </div>

        <button onClick={() => pm && !busy && onPay()} disabled={!pm || busy} style={{ ...S.btnPrimary, background: pm ? V.accent : V.sub, opacity: busy ? 0.7 : 1, cursor: pm && !busy ? 'pointer' : 'not-allowed' }}>
          {pm ? <><CreditCard size={15} /> Pay Securely</> : <><CreditCard size={15} style={{ opacity: 0.5 }} /> Select a payment method</>}
        </button>
        <p style={{ fontSize: 12, color: V.sub, textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Shield size={11} /> Your payment is protected by TrustTrade
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 4 — Funds secured; seller delivers (waybill for courier)
 * ──────────────────────────────────────────────────────────────────────── */
function StepFundsSecured({ form, buyerBase, estTotal, isCourier, waybill, arrival, onNext, busy }) {
  return (
    <div>
      {/* Secured banner */}
      <div style={{ background: 'rgba(63,185,80,0.14)', border: `1px solid ${V.success}55`, borderRadius: 14, padding: '18px 20px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(63,185,80,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldCheck size={22} color="#34D399" />
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#6EE7B7', margin: '0 0 3px' }}>Payment secured 🎉</p>
          <p style={{ fontSize: 13, color: '#34D399', margin: 0 }}>{rand(estTotal)} is held safely in TrustTrade escrow. The seller is now clear to deliver.</p>
        </div>
      </div>

      {/* Payout timeline */}
      <div style={S.card}>
        <p style={{ fontSize: 11, color: V.sub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Payout timeline</p>
        {[
          { label: 'Payment secured in escrow', detail: 'Just now', done: true },
          { label: 'Seller delivers the item', detail: isCourier ? 'Courier Guy collection booked' : 'In-person handover', done: false, active: true },
          { label: 'Buyer confirms receipt', detail: 'Releases the payment', done: false },
          { label: 'Payout to seller', detail: `Estimated arrival ${arrival}`, done: false },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: s.done ? V.success : s.active ? V.accent : V.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: s.active ? 'demoPulse 1.6s ease-in-out infinite' : 'none' }}>
                {s.done && <CheckCircle size={11} color="#fff" />}
              </div>
              {i < arr.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 22, background: s.done ? V.success : V.border }} />}
            </div>
            <div style={{ paddingBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: s.done || s.active ? V.text : V.sub, margin: '0 0 2px' }}>{s.label}</p>
              <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Funds Secured — Deliver Item (seller action) */}
      <div style={S.actionCard('#8b5cf6', 'rgba(139,92,246,0.14)')}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(139,92,246,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Truck size={18} color="#C4B5FD" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#C4B5FD', margin: '0 0 4px' }}>Funds Secured — Deliver Item</p>
            <p style={{ fontSize: 13, color: '#C4B5FD', margin: '0 0 14px' }}>Payment received and held securely. Deliver the item to the buyer and mark it as dispatched.</p>

            {isCourier && (
              <div style={{ background: V.bg, border: `1px solid ${V.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 6 }}>Courier Guy waybill</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: V.text, fontFamily: V.mono, letterSpacing: '0.04em' }}>{waybill}</span>
                  <span style={S.pill('rgba(63,185,80,0.14)', '#34D399')}>Collection booked</span>
                </div>
                <p style={{ fontSize: 11, color: V.sub, margin: '8px 0 0' }}>TrustTrade booked the courier automatically — no need to arrange it yourself.</p>
              </div>
            )}

            <button onClick={() => !busy && onNext()} disabled={busy} style={{ ...S.btnPrimary, height: 40, background: '#8b5cf6', width: 'auto', padding: '0 18px', opacity: busy ? 0.6 : 1 }}>
              {busy ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><Truck size={14} /> Mark as Dispatched</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 5 — Buyer confirms receipt & releases payment
 * ──────────────────────────────────────────────────────────────────────── */
function StepConfirmReceipt({ form, sellerPayout, onNext, busy }) {
  return (
    <div>
      <div style={{ background: 'rgba(245,158,11,0.10)', border: `1px solid ${V.warn}44`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Truck size={16} color="#FBBF24" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 13, color: '#FBBF24', margin: 0 }}>Your item has been delivered. Confirm below to release the payment to the seller.</p>
      </div>

      <div style={S.actionCard(V.success, 'rgba(63,185,80,0.14)')}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(63,185,80,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={18} color="#34D399" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#6EE7B7', margin: '0 0 4px' }}>Confirm &amp; Release Payment</p>
            <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 10px' }}>Your funds are secured in escrow. Once you confirm you're happy with what you received, {rand(sellerPayout)} is released to the seller.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(245,158,11,0.14)', border: `1px solid ${V.warn}44`, borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
              <AlertTriangle size={15} color="#FBBF24" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#FBBF24', margin: 0, lineHeight: 1.5 }}><strong>Only confirm if you are satisfied</strong> — this cannot be undone.</p>
            </div>
            <button onClick={() => !busy && onNext()} disabled={busy} style={{ ...S.btnSuccess, opacity: busy ? 0.6 : 1 }}>
              {busy ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Releasing…</> : <><CheckCircle2 size={15} /> Confirm &amp; Release Payment</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 6 — Paid! Celebration + SMS & email previews
 * ──────────────────────────────────────────────────────────────────────── */
function StepPaid({ form, sellerPayout, arrival, onRestart, onSignup }) {
  const smsText = `TrustTrade: Your ${randTight(sellerPayout)} payout for TT-DEMO-4821 is being processed to your ${SELLER.bank} account. Expected arrival ${arrival}. Questions? trusttrade.register@gmail.com`;
  return (
    <div>
      {/* Celebration */}
      <div style={{ ...S.card, textAlign: 'center', padding: '30px 24px', background: 'linear-gradient(160deg, rgba(63,185,80,0.16), rgba(22,27,34,0.6))', border: `1px solid ${V.success}55` }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(63,185,80,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'demoPop 0.5s ease both' }}>
          <CheckCircle2 size={34} color="#34D399" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#6EE7B7', margin: '0 0 6px' }}>Paid! Transaction complete 🎉</h2>
        <p style={{ fontSize: 14, color: '#34D399', margin: '0 0 18px' }}>The buyer confirmed receipt and the payment was released.</p>
        <div style={{ display: 'inline-block', background: V.bg, border: `1px solid ${V.border}`, borderRadius: 12, padding: '16px 28px' }}>
          <p style={{ fontSize: 11, color: V.sub, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontWeight: 700 }}>Seller payout</p>
          <p style={{ fontSize: 34, fontWeight: 800, color: V.text, margin: 0, fontFamily: V.mono, letterSpacing: '-0.02em' }}>{rand(sellerPayout)}</p>
          <p style={{ fontSize: 12, color: V.sub, margin: '8px 0 0' }}>To {SELLER.bank} · arriving {arrival}</p>
        </div>
      </div>

      {/* SMS preview */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MessageSquare size={15} color={V.accent} />
          <p style={{ fontSize: 13, fontWeight: 700, color: V.text, margin: 0 }}>SMS sent to the seller</p>
        </div>
        <div style={{ background: V.bg, border: `1px solid ${V.border}`, borderRadius: '4px 14px 14px 14px', padding: '12px 14px', maxWidth: 380 }}>
          <p style={{ fontSize: 13, color: V.text, margin: 0, lineHeight: 1.55 }}>{smsText}</p>
        </div>
        <p style={{ fontSize: 11, color: V.dim, margin: '8px 0 0', fontFamily: V.mono }}>to {SELLER.phone}</p>
      </div>

      {/* Email preview */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Mail size={15} color={V.accent} />
          <p style={{ fontSize: 13, fontWeight: 700, color: V.text, margin: 0 }}>Email sent to the seller</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${V.border}` }}>
          <div style={{ background: '#0D1117', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #30363D' }}>
            <TrustTradeLogo size="small" showText dark />
          </div>
          <div style={{ padding: '20px 22px' }}>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#0a7d33', background: '#e8f5e9', borderRadius: 20, padding: '3px 12px', marginBottom: 12 }}>Payout processing</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#10b981', margin: '0 0 10px' }}>Your funds are on their way! 🎉</h3>
            <p style={{ fontSize: 14, color: '#1f2937', margin: '0 0 12px', lineHeight: 1.6 }}>
              Hi {SELLER.name.split(' ')[0]}, {BUYER.name.split(' ')[0]} has confirmed receipt of your item. Your payment has been released from escrow and is being processed to <strong>your {SELLER.bank} account</strong>.
            </p>
            <p style={{ fontSize: 14, color: '#1f2937', margin: '0 0 16px', lineHeight: 1.6 }}>
              You can expect the funds by <strong>{arrival}</strong> (up to 2 business days).
            </p>
            <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '14px 16px' }}>
              <table style={{ width: '100%', fontSize: 13, color: '#1f2937', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ padding: '3px 0' }}>You Receive:</td><td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{rand(sellerPayout)}</td></tr>
                  <tr><td style={{ padding: '3px 0' }}>Estimated Arrival:</td><td style={{ textAlign: 'right' }}>{arrival}</td></tr>
                  <tr><td style={{ padding: '3px 0' }}>Status:</td><td style={{ textAlign: 'right' }}>Payout processing</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: V.dim, margin: '8px 0 0', fontFamily: V.mono }}>to {SELLER.email}</p>
      </div>

      {/* Sign-up CTA */}
      <div style={{ background: 'linear-gradient(135deg, rgba(47,129,244,0.16), rgba(63,185,80,0.10))', border: `1px solid ${V.border}`, borderRadius: 16, padding: '26px 22px', textAlign: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 19, fontWeight: 800, color: V.text, margin: '0 0 6px' }}>That's the whole flow — start to payout.</h3>
        <p style={{ fontSize: 14, color: V.sub, margin: '0 0 18px' }}>Ready to do it for real? Your first secure transaction takes about 2 minutes.</p>
        <button onClick={onSignup} style={{ ...S.btnPrimary, width: 'auto', display: 'inline-flex', padding: '0 26px', height: 46, fontSize: 15, fontWeight: 700, boxShadow: '0 10px 30px rgba(47,129,244,0.35)' }}>
          Get Started Free <ArrowRight size={16} />
        </button>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={onRestart} style={{ background: 'none', border: 'none', color: V.dim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} /> Replay the demo
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: V.sub }}>{label}</span>
      <span style={{ fontWeight: 500, color: V.text }}>{value}</span>
    </div>
  );
}
