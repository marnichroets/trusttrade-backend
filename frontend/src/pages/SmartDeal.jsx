import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle, Clock, Briefcase, Shield,
  AlertTriangle, Zap, ArrowRight, Send,
  MessageSquare, Lock, CreditCard, Landmark, Bolt,
  Plus, Trash2, Layers, X,
} from "lucide-react";
import PaymentConfirmModal from "../components/PaymentConfirmModal";

const API = process.env.REACT_APP_API_URL || "https://trusttrade-backend-production-3efa.up.railway.app";

// Minimum escrow amount — must match the backend (settings.MINIMUM_TRANSACTION_AMOUNT).
const MIN_TRANSACTION_AMOUNT = 500;
const MIN_TRANSACTION_MESSAGE = `Minimum transaction amount is R${MIN_TRANSACTION_AMOUNT} to cover processing fees.`;

// Delivery window bounds — must match the backend check in routes/smart_deals.py.
const MIN_DELIVERY_DAYS = 1;
const MAX_DELIVERY_DAYS = 60;
const DELIVERY_DAYS_MESSAGE = `Delivery days must be between ${MIN_DELIVERY_DAYS} and ${MAX_DELIVERY_DAYS}`;

// Shared dark theme — matches the app palette (V) used across all pages.
const D = {
  bg:           "#0D1117",  // canvas / inset panels & input fields (darker than cards)
  surface:      "#161B22",  // card background, elevated from canvas
  surfaceHi:    "#30363D",  // raised rows / inbound chat bubbles / inactive toggles
  border:       "#30363D",
  borderLight:  "#30363D",
  text:         "#E6EDF3",
  textMuted:    "#8B949E",
  textSoft:     "#6E7681",
  accent:       "#2F81F4",  // primary CTA blue (white text)
  blue:         "#2F81F4",
  success:      "#3FB950",
  warning:      "#D29922",
  danger:       "#F85149",
  orange:       "#F97316",
  purple:       "#8B5CF6",
};

const STATUS = {
  PENDING:         { label: "Awaiting agreement",                      color: "#FBBF24", bg: "rgba(245,158,11,0.14)", dot: "#D29922" },
  ACCEPTED:        { label: "Awaiting payment",                        color: "#2F81F4", bg: "rgba(59,130,246,0.14)", dot: "#2F81F4" },
  PAYMENT_PENDING: { label: "Awaiting payment",                        color: "#2F81F4", bg: "rgba(59,130,246,0.14)", dot: "#60A5FA" },
  FUNDED:          { label: "Money held safely",                       color: "#3FB950", bg: "rgba(16,185,129,0.14)", dot: "#3FB950" },
  DELIVERED:       { label: "Awaiting client confirmation",            color: "#8B5CF6", bg: "rgba(139,92,246,0.14)", dot: "#8B5CF6" },
  APPROVED:        { label: "Payout processing · up to 2 business days",    color: "#3FB950", bg: "rgba(16,185,129,0.14)", dot: "#3FB950" },
  COMPLETE:        { label: "Completed",                               color: "#3FB950", bg: "rgba(16,185,129,0.14)", dot: "#3FB950" },
  DISPUTED:        { label: "Disputed / protection hold",              color: "#F85149", bg: "rgba(239,68,68,0.14)", dot: "#F85149" },
  // Milestone-deal (parent) statuses:
  PROPOSED:          { label: "Awaiting approval",        color: "#FBBF24", bg: "rgba(245,158,11,0.14)", dot: "#D29922" },
  STRUCTURE_APPROVED:{ label: "Approved — pay first stage", color: "#2F81F4", bg: "rgba(59,130,246,0.14)", dot: "#2F81F4" },
  IN_PROGRESS:       { label: "In progress",              color: "#2F81F4", bg: "rgba(126,155,201,0.12)", dot: "#2F81F4" },
};

// Per-milestone status chips (milestone deals).
const MS_STATUS = {
  PROPOSED:        { label: "Not started yet",          color: "#6E7681", bg: "rgba(148,163,184,0.14)", dot: "#8B949E" },
  AWAITING_PAYMENT:{ label: "Ready to pay",             color: "#2F81F4", bg: "rgba(59,130,246,0.14)", dot: "#2F81F4" },
  PAYMENT_PENDING: { label: "Awaiting payment",         color: "#2F81F4", bg: "rgba(59,130,246,0.14)", dot: "#60A5FA" },
  FUNDED:          { label: "Paid — work in progress",  color: "#3FB950", bg: "rgba(16,185,129,0.14)", dot: "#3FB950" },
  DELIVERED:       { label: "Delivered — please review",color: "#8B5CF6", bg: "rgba(139,92,246,0.14)", dot: "#8B5CF6" },
  RELEASED:        { label: "Approved & paid",          color: "#3FB950", bg: "rgba(16,185,129,0.14)", dot: "#3FB950" },
  DISPUTED:        { label: "On hold — disputed",       color: "#F85149", bg: "rgba(239,68,68,0.14)", dot: "#F85149" },
};

const PAYMENT_METHODS = [
  { id: "eft",  label: "EFT Bank Transfer",   fee: 0,   desc: "Manual bank transfer — no extra fee",  Icon: Landmark   },
  { id: "ozow", label: "Ozow Instant EFT",    fee: 1.5, desc: "Instant online banking",               Icon: Bolt       },
  { id: "card", label: "Credit / Debit Card", fee: 2.5, desc: "Visa & Mastercard accepted",           Icon: CreditCard },
];

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("session_token");
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    const detail = err.detail;
    let msg;
    if (typeof detail === "string") msg = detail;
    else if (Array.isArray(detail)) msg = detail.map(d => d.msg || d.message || JSON.stringify(d)).join("; ");
    else if (detail && typeof detail === "object") msg = detail.message || detail.msg || JSON.stringify(detail);
    else msg = err.message || "Request failed";
    throw new Error(msg);
  }
  return res.json();
}

// ─── Shared style helpers ──────────────────────────────────────────────────

const card = (extra = {}) => ({
  background: D.surface,
  border: `1px solid ${D.border}`,
  borderRadius: 14,
  padding: "20px 22px",
  marginBottom: 14,
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  ...extra,
});

const btn = (bg, color = "#fff", extra = {}) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: 7, padding: "11px 20px", borderRadius: 9, border: "none",
  background: bg, color, fontSize: 13, fontWeight: 600,
  cursor: "pointer", transition: "opacity 0.15s", fontFamily: "inherit",
  whiteSpace: "nowrap", ...extra,
});

const label = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: D.textSoft, textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: 6,
};

const input = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 8,
  border: `1px solid ${D.border}`, fontSize: 13, color: D.text,
  background: D.bg, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", marginBottom: 14,
};

const textarea = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${D.border}`, fontSize: 13, color: D.text,
  background: D.bg, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", resize: "vertical", minHeight: 88,
  marginBottom: 14,
};

const Spinner = ({ size = 13 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    border: `2px solid rgba(255,255,255,0.2)`,
    borderTopColor: "#fff",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  }} />
);

// ─── StatusBadge ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, color: D.textMuted, bg: D.surface, dot: D.textSoft };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 10px",
      borderRadius: 20, background: s.bg, color: s.color,
      border: `1px solid ${s.dot}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── ProgressTracker ──────────────────────────────────────────────────────

function ProgressTracker({ status }) {
  const steps = ["PENDING", "ACCEPTED", "FUNDED", "DELIVERED", "COMPLETE"];
    const stepLabels = { PENDING: "Agreement", ACCEPTED: "Payment", FUNDED: "Held safely", DELIVERED: "Confirm", COMPLETE: "Complete" };
  const cur = status === "DISPUTED" ? "DELIVERED" : status === "PAYMENT_PENDING" ? "ACCEPTED" : status;
  const curIdx = steps.indexOf(cur);
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", background: D.surfaceHi, borderRadius: 12, marginBottom: 14, border: `1px solid ${D.border}` }}>
      {steps.map((step, i) => (
        <div key={step} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: i < curIdx ? D.success : i === curIdx ? D.blue : D.surfaceHi,
              color: i <= curIdx ? "#fff" : D.textSoft,
              border: `2px solid ${i < curIdx ? D.success : i === curIdx ? D.blue : D.border}`,
            }}>
              {i < curIdx ? <CheckCircle size={13} /> : i + 1}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: i <= curIdx ? D.text : D.textSoft, whiteSpace: "nowrap" }}>
              {stepLabels[step]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 6px", marginBottom: 20,
              background: i < curIdx ? D.success : D.border, borderRadius: 2,
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────

function InfoRow({ label: lbl, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${D.surfaceHi}` }}>
      <span style={{ fontSize: 12, color: D.textMuted }}>{lbl}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: D.text, fontFamily: mono ? "ui-monospace, monospace" : "inherit", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

// ─── ActionCard ───────────────────────────────────────────────────────────

function ActionCard({ accent, children }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${accent}44`,
      borderLeft: `3px solid ${accent}`, borderRadius: 14,
      padding: "18px 20px", marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// ─── EftDetailsCard ───────────────────────────────────────────────────────
// Bank-transfer details + reference, with a copy button per field. Rendered from
// the deal's stored eft_details so it survives the status flip to PAYMENT_PENDING
// (FundPanel unmounts on that flip — the buyer must always be able to see where to pay).

function EftDetailsCard({ details, fallbackAmount }) {
  const [copiedField, setCopiedField] = useState(null);
  const fmt = v => `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  const copy = (key, value) => {
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField(k => (k === key ? null : k)), 1500);
    });
  };

  const rows = [
    ["Bank", details.bank],
    ["Account name", details.account_name],
    ["Account number", details.account_number],
    ["Branch code", details.branch_code],
    ["Reference", details.reference],
    ["Amount to pay", fmt(details.amount ?? fallbackAmount ?? 0)],
  ];

  return (
    <ActionCard accent={D.blue}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Landmark size={15} color={D.accent} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Pay via EFT bank transfer</h3>
      </div>
      <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 16px", lineHeight: 1.5 }}>
        {details.instructions || "Use this reference number when making your EFT payment. Funds will be confirmed within 1–2 business days."}
      </p>
      <div style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "6px 14px", marginBottom: 14 }}>
        {rows.map(([lbl, value]) => (
          <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${D.border}` }}>
            <span style={{ fontSize: 12, color: D.textMuted }}>{lbl}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.text, fontFamily: "ui-monospace, monospace" }}>{value || "—"}</span>
              {value && (
                <button
                  type="button"
                  onClick={() => copy(lbl, value)}
                  style={{ fontSize: 11, color: copiedField === lbl ? D.success : D.accent, background: "none", border: "none", cursor: "pointer", padding: 0, minWidth: 34, textAlign: "right" }}
                >
                  {copiedField === lbl ? "Copied" : "Copy"}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: D.warning, background: "rgba(245,158,11,0.14)", border: `1px solid ${D.warning}44`, borderRadius: 8, padding: "10px 12px", margin: 0 }}>
        Use the reference <strong>exactly as shown</strong>. This deal stays in <strong>Awaiting Payment</strong> until the funds are confirmed (1–2 business days).
      </p>
    </ActionCard>
  );
}

// ─── FundPanel ────────────────────────────────────────────────────────────

function FundPanel({ deal }) {
  const [method, setMethod] = useState("eft");
  const [loading, setLoading] = useState(false);
  const [payConfirm, setPayConfirm] = useState(null);  // { link, total_value, processing_fee }
  const [err, setErr] = useState(null);
  const [eftDetails, setEftDetails] = useState(null);

  // The client pays the 2% TrustTrade fee on top of the deal amount. We don't add a
  // payment-processing estimate — a note tells them a small bank fee is added at checkout.
  const platformFee = deal.platform_fee != null
    ? Number(deal.platform_fee)
    : Math.max(Number(deal.amount) * 0.02, 5);
  const total = Math.round((Number(deal.amount) + platformFee) * 100) / 100;
  const fmt = v => `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  async function handleFund() {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/smart-deals/${deal.deal_id}/fund`, {
        method: "POST",
        body: JSON.stringify({ payment_method: method }),
      });
      // Same as a normal transaction: send the client to the TradeSafe payment page.
      // The deal stays PAYMENT_PENDING and only becomes FUNDED on the FUNDS_DEPOSITED
      // webhook — we must NEVER advance it here without confirmed payment.
      if (res.payment_link) {
        // Show the EXACT amount TradeSafe will charge (from the deposit) in a styled
        // modal before paying.
        if (res.total_value != null) {
          setPayConfirm({ link: res.payment_link, total_value: res.total_value, processing_fee: res.processing_fee });
          setLoading(false);
          return;
        }
        window.location.href = res.payment_link;
        return;
      }
      // EFT has no hosted page — show bank-transfer details + reference instead.
      if (res.eft_details) {
        setEftDetails(res.eft_details);
        return;
      }
      setErr(
        res.message ||
        "Couldn't start the payment. Please try again or pick another method."
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const confirmAndPay = () => { const pc = payConfirm; if (!pc) return; setPayConfirm(null); window.location.href = pc.link; };

  if (eftDetails) {
    return <EftDetailsCard details={eftDetails} fallbackAmount={total} />;
  }

  return (
    <>
    <PaymentConfirmModal open={!!payConfirm} amount={payConfirm?.total_value} processingFee={payConfirm?.processing_fee} onConfirm={confirmAndPay} onCancel={() => setPayConfirm(null)} />
    <ActionCard accent={D.blue}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Lock size={15} color={D.blue} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Pay safely</h3>
      </div>
      <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 16px", lineHeight: 1.5 }}>
          We hold your money safely and only pay it out when <strong style={{ color: D.text }}>you approve</strong> the work. Payouts can take up to 2 business days.
      </p>

      {/* Payment method selection */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {PAYMENT_METHODS.map(m => {
          const active = method === m.id;
          return (
            <label
              key={m.id}
              onClick={() => setMethod(m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${active ? D.blue : D.border}`,
                background: active ? "rgba(59,130,246,0.14)" : D.surfaceHi,
                transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? D.blue : D.borderLight}`,
                background: active ? D.blue : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <m.Icon size={15} color={active ? D.blue : D.textMuted} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: D.text, margin: "0 0 1px" }}>{m.label}</p>
                <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{m.desc}</p>
              </div>
            </label>
          );
        })}
      </div>

      {/* Payment summary — deal amount + 2% TrustTrade fee (paid by the client). */}
      <div style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: D.textMuted }}>Deal amount</span>
          <span style={{ fontSize: 12, color: D.text, fontFamily: "ui-monospace, monospace" }}>{fmt(deal.amount)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: D.textMuted }}>TrustTrade fee (2%)</span>
          <span style={{ fontSize: 12, color: D.text, fontFamily: "ui-monospace, monospace" }}>{fmt(platformFee)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${D.border}`, paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Total you pay</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmt(total)}</span>
        </div>
        <p style={{ fontSize: 11, color: D.textSoft, margin: "8px 0 0" }}>A small bank processing fee will be added at checkout.</p>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, color: D.danger, fontSize: 13, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <button
        onClick={handleFund}
        disabled={loading}
        style={{ ...btn(D.blue), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? <><Spinner /> Setting up payment…</> : <><Lock size={14} /> Continue to payment · {fmt(total)}</>}
      </button>
    </ActionCard>
    </>
  );
}

// ─── MessageThread ────────────────────────────────────────────────────────

function MessageThread({ dealId, messages, currentUserId }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState(messages);
  const bottomRef = useRef(null);
  const prevCountRef = useRef(messages.length);

  useEffect(() => { setLocalMessages(messages); }, [messages]);

  // Only scroll to bottom when message count grows (new message), not on every refresh
  useEffect(() => {
    if (localMessages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = localMessages.length;
  }, [localMessages]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/api/smart-deals/${dealId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setText("");
      setLocalMessages(prev => [...prev, msg]);
    } catch {
      // silently ignore — user can retry
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <MessageSquare size={14} color={D.accent} />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Messages
        </h3>
      </div>

      {localMessages.length === 0 && (
        <p style={{ fontSize: 12, color: D.textSoft, textAlign: "center", padding: "16px 0", margin: 0 }}>
          No messages yet — start the conversation.
        </p>
      )}

      <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: localMessages.length ? 12 : 0 }}>
        {localMessages.map((m, i) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.message_id || i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div style={{
                background: mine ? D.blue : D.surfaceHi,
                border: `1px solid ${mine ? D.blue + "66" : D.border}`,
                borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "8px 12px", maxWidth: "75%",
              }}>
                {!mine && (
                  <p style={{ fontSize: 10, fontWeight: 600, color: D.accent, margin: "0 0 3px" }}>{m.sender_name || m.sender_email}</p>
                )}
                <p style={{ fontSize: 13, color: mine ? "#fff" : D.text, margin: 0, lineHeight: 1.4, wordBreak: "break-word" }}>{m.content}</p>
                <p style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.75)" : D.textMuted, margin: "3px 0 0", textAlign: mine ? "right" : "left" }}>
                  {new Date(m.sent_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message…"
          style={{ ...input, flex: 1, height: 40, marginBottom: 0 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{ ...btn(D.blue, "#fff", { height: 40, padding: "0 16px", opacity: (sending || !text.trim()) ? 0.5 : 1 }) }}
        >
          {sending ? <Spinner /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateSmartDeal
// ─────────────────────────────────────────────────────────────────────────────

export function CreateSmartDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", description: "", amount: "",
    freelancer_email: "", days_to_deliver: "", fee_paid_by: "CLIENT",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount";
    else if (Number(form.amount) < MIN_TRANSACTION_AMOUNT) e.amount = MIN_TRANSACTION_MESSAGE;
    if (!form.freelancer_email.includes("@")) e.freelancer_email = "Enter a valid email";
    // Empty defaults to 1; otherwise must be a whole number from 1 to 60.
    if (form.days_to_deliver !== "") {
      const days = Number(form.days_to_deliver);
      if (!Number.isInteger(days) || days < MIN_DELIVERY_DAYS || days > MAX_DELIVERY_DAYS) {
        e.days_to_deliver = DELIVERY_DAYS_MESSAGE;
      }
    }
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true); setApiError(null);
    try {
      const days_to_deliver = form.days_to_deliver === "" ? 1 : Number(form.days_to_deliver);
      const res = await apiFetch("/api/smart-deals/", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount), days_to_deliver }),
      });
      navigate(`/smart-deals/${res.deal_id}`);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fieldErr = k => errors[k] ? <p style={{ fontSize: 11, color: D.danger, margin: "2px 0 8px" }}>{errors[k]}</p> : null;
  const borderErr = k => errors[k] ? D.danger : D.border;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: D.textMuted, textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2F81F4, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Briefcase size={17} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>New Smart Deal</h1>
        </div>
        <p style={{ fontSize: 13, color: D.textMuted, margin: 0 }}>
          We hold your money safely and only pay it out when you approve the work. Payouts can take up to 2 business days.
        </p>
      </div>

      {apiError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
          {apiError}
        </div>
      )}

      <div style={card()}>
        <div style={{ marginBottom: 4 }}>
          <label style={label}>Deal Title</label>
          <input style={{ ...input, borderColor: borderErr("title") }} placeholder="e.g. Logo design for Acme Co" value={form.title} onChange={set("title")} />
          {fieldErr("title")}
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={label}>Scope of Work</label>
          <textarea style={{ ...textarea, borderColor: borderErr("description") }} placeholder="Describe exactly what will be delivered…" value={form.description} onChange={set("description")} />
          {fieldErr("description")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
          <div>
            <label style={label}>Amount (ZAR)</label>
            <input style={{ ...input, fontFamily: "ui-monospace, monospace", fontWeight: 600, borderColor: borderErr("amount") }} type="number" min={MIN_TRANSACTION_AMOUNT} placeholder="5 000" value={form.amount} onChange={set("amount")} />
            {fieldErr("amount") || <p style={{ fontSize: 11, color: D.textMuted, margin: "2px 0 8px" }}>Minimum R{MIN_TRANSACTION_AMOUNT}.</p>}
          </div>
          <div>
            <label style={label}>Days to Deliver</label>
            <input style={{ ...input, borderColor: borderErr("days_to_deliver") }} type="number" min={MIN_DELIVERY_DAYS} max={MAX_DELIVERY_DAYS} step={1} placeholder="7" value={form.days_to_deliver} onChange={set("days_to_deliver")} />
            {fieldErr("days_to_deliver") || <p style={{ fontSize: 11, color: D.textMuted, margin: "2px 0 8px" }}>1–{MAX_DELIVERY_DAYS} days (defaults to 1).</p>}
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={label}>Freelancer Email</label>
          <input style={{ ...input, borderColor: borderErr("freelancer_email") }} type="email" placeholder="freelancer@example.com" value={form.freelancer_email} onChange={set("freelancer_email")} />
          {fieldErr("freelancer_email")}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ ...label, marginBottom: 10 }}>Who pays the TrustTrade fee?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { value: "CLIENT",     title: "I pay (client)",    desc: "Fee added to your payment"      },
              { value: "FREELANCER", title: "Freelancer pays",   desc: "Fee deducted from payout"       },
            ].map(opt => {
              const active = form.fee_paid_by === opt.value;
              return (
                <label key={opt.value} onClick={() => setForm(f => ({ ...f, fee_paid_by: opt.value }))} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "12px 14px", borderRadius: 10,
                  border: `1.5px solid ${active ? D.blue : D.border}`,
                  background: active ? "rgba(59,130,246,0.14)" : D.surfaceHi, cursor: "pointer",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${active ? D.blue : D.borderLight}`,
                    background: active ? D.blue : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: D.text, margin: "0 0 2px" }}>{opt.title}</p>
                    <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(59,130,246,0.10)", border: `1px solid ${D.accent}33`, marginBottom: 18 }}>
          <Shield size={15} color={D.accent} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: D.textMuted, margin: 0, lineHeight: 1.5 }}>
            Your freelancer accepts, you pay (we hold the money safely), they do the work, and you approve to pay them. A dispute pauses the payout.
          </p>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(D.accent, "#fff"), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? <><Spinner /> Creating…</> : <><Zap size={14} /> Create Smart Deal</>}
        </button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${D.blue}!important;box-shadow:0 0 0 3px ${D.blue}22;} *{box-sizing:border-box}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SmartDealDetail
// ─────────────────────────────────────────────────────────────────────────────

export function SmartDealDetail() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [cancellingPayment, setCancellingPayment] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([
        apiFetch(`/api/smart-deals/${dealId}`),
        apiFetch("/api/auth/me"),
      ]);
      setDeal(d); setCurrentUser(u);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s while deal is in an active state
  useEffect(() => {
    const ACTIVE = new Set([
      "PENDING", "ACCEPTED", "PAYMENT_PENDING", "FUNDED", "DELIVERED",
      // Milestone deals: keep polling while a milestone is being funded/worked.
      "PROPOSED", "STRUCTURE_APPROVED", "IN_PROGRESS",
    ]);
    if (!deal || !ACTIVE.has(deal.status)) return;
    const id = setInterval(() => {
      const scrollY = window.scrollY;
      apiFetch(`/api/smart-deals/${dealId}`)
        .then(d => {
          setDeal(d);
          requestAnimationFrame(() => window.scrollTo(0, scrollY));
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [dealId, deal?.status]);

  const isClient     = currentUser && deal && String(deal.client_id)     === String(currentUser.user_id);
  const isFreelancer = currentUser && deal && String(deal.freelancer_id)  === String(currentUser.user_id);

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleAccept() {
    setAccepting(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${dealId}/accept`, { method: "POST" }); await load(); }
    catch (e) { setActionError(e.message); } finally { setAccepting(false); }
  }

  async function handleDeliver() {
    if (!window.confirm("Mark work as delivered? The client will be notified to review.")) return;
    setDelivering(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${dealId}/deliver`, { method: "POST" }); await load(); }
    catch (e) { setActionError(e.message); } finally { setDelivering(false); }
  }

  async function handleApprove() {
    if (!window.confirm("Approve the work and pay the freelancer? Payouts can take up to 2 business days.")) return;
    setApproving(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${dealId}/approve`, { method: "POST" }); await load(); }
    catch (e) { setActionError(e.message); } finally { setApproving(false); }
  }

  async function handleCancelPayment() {
    setCancellingPayment(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${dealId}/cancel-payment`, { method: "POST" }); await load(); }
    catch (e) { setActionError(e.message); } finally { setCancellingPayment(false); }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setDisputing(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/dispute`, { method: "POST", body: JSON.stringify({ reason: disputeReason }) });
      setShowDisputeForm(false); await load();
    } catch (e) { setActionError(e.message); } finally { setDisputing(false); }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${D.border}`, borderTopColor: D.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13 }}>
        {error}
      </div>
    </div>
  );

  if (!deal) return null;

  // Milestone deals render a dedicated view (structure approval + per-milestone flow).
  if (deal.deal_type === "DIGITAL_WORK_MILESTONE" || Array.isArray(deal.milestones)) {
    return (
      <MilestoneDealView
        deal={deal}
        currentUser={currentUser}
        isClient={isClient}
        isFreelancer={isFreelancer}
        reload={load}
      />
    );
  }

  const fmt = v => `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: D.textMuted, textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: "0 0 8px", wordBreak: "break-word" }}>{deal.title}</h1>
          <StatusBadge status={deal.status} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmt(deal.amount)}</div>
          <div style={{ fontSize: 11, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>{deal.currency}</div>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
          {actionError}
        </div>
      )}

      <ProgressTracker status={deal.status} />

      {/* Share link — visible to client */}
      {isClient && (
        <div style={card({ marginBottom: 14 })}>
          <p style={{ fontSize: 11, fontWeight: 700, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>
            Share with Freelancer
          </p>
          <p style={{ fontSize: 12, color: D.textMuted, margin: "0 0 10px" }}>
            Send this link to your freelancer so they can view and accept the deal.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              background: D.bg, border: `1px solid ${D.border}`,
              fontSize: 12, color: D.textMuted,
              fontFamily: "ui-monospace, monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {window.location.href}
            </div>
            <button
              onClick={copyShareLink}
              style={{ ...btn(copied ? D.success : D.blue, "#fff", { flexShrink: 0 }) }}
            >
              {copied ? <><CheckCircle size={13} /> Copied!</> : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`I've set up a secure TrustTrade deal for you. Click the link to view and confirm it: ${window.location.href}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#25D366', color: 'white', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, borderRadius: 4, textDecoration: 'none', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* ── Action panels ── */}

      {/* Freelancer: accept */}
      {isFreelancer && deal.status === "PENDING" && (
        <ActionCard accent={D.orange}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={D.orange} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Accept this deal</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            Check the work and amount. Once you accept, the client pays and you can start.
          </p>
          <button onClick={handleAccept} disabled={accepting} style={{ ...btn(D.orange), opacity: accepting ? 0.6 : 1 }}>
            {accepting ? <><Spinner /> Accepting…</> : <>Accept deal <ArrowRight size={14} /></>}
          </button>
        </ActionCard>
      )}

      {/* Client: fund escrow */}
      {isClient && deal.status === "ACCEPTED" && (
        <FundPanel deal={deal} />
      )}

      {/* Client: awaiting payment confirmation */}
      {isClient && deal.status === "PAYMENT_PENDING" && (
        <>
          {/* EFT chosen → keep the bank details + reference card visible the whole time
              the deal waits for payment, so the client always knows where to pay. */}
          {deal.eft_details && (
            <EftDetailsCard details={deal.eft_details} fallbackAmount={deal.total ?? deal.amount} />
          )}
          <ActionCard accent={D.blue}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${D.blue}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Waiting for payment confirmation</h3>
            </div>
            <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
              {deal.eft_details
                ? "Once you've paid using the details above, it can take 1–2 business days to show. The freelancer is told the moment it's in. This page updates on its own."
                : "We're waiting for your payment to come through. Once it's in, the freelancer can start. This page updates on its own."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {deal.payment_link && (
                <a
                  href={deal.payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...btn(D.blue, "#fff"), textDecoration: "none" }}
                >
                  <Lock size={14} /> Resume payment
                </a>
              )}
              <button
                onClick={handleCancelPayment}
                disabled={cancellingPayment}
                style={{ ...btn("transparent", D.textMuted, { border: `1px solid ${D.border}`, opacity: cancellingPayment ? 0.6 : 1, cursor: cancellingPayment ? "not-allowed" : "pointer" }) }}
              >
                {cancellingPayment ? <><Spinner /> Resetting…</> : "Change Payment Method"}
              </button>
            </div>
          </ActionCard>
        </>
      )}

      {/* Freelancer: mark as delivered */}
      {isFreelancer && deal.status === "FUNDED" && (
        <ActionCard accent={D.purple}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={D.purple} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Mark as delivered</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            When the work is done, mark it as done. The client reviews and approves to pay you.
          </p>
          <button onClick={handleDeliver} disabled={delivering} style={{ ...btn(D.purple), opacity: delivering ? 0.6 : 1 }}>
            {delivering ? <><Spinner /> Submitting…</> : <><CheckCircle size={14} /> Mark as delivered</>}
          </button>
        </ActionCard>
      )}

      {/* Client: review & approve / dispute */}
      {isClient && deal.status === "DELIVERED" && (
        <ActionCard accent={D.success}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={D.success} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Review the work</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            Approve to pay the freelancer. Payouts can take up to 2 business days. Not happy? Raise a dispute to pause it.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleApprove} disabled={approving} style={{ ...btn(D.success), flex: 1, minWidth: 160, opacity: approving ? 0.6 : 1 }}>
              {approving ? <><Spinner /> Releasing…</> : <><CheckCircle size={14} /> Approve release</>}
            </button>
            <button onClick={() => setShowDisputeForm(v => !v)} style={{ ...btn(D.danger), minWidth: 100 }}>
              <AlertTriangle size={14} /> Dispute
            </button>
          </div>

          {showDisputeForm && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${D.success}33` }}>
              <label style={{ ...label, marginBottom: 8 }}>Describe the issue</label>
              <textarea
                style={{ ...textarea, marginBottom: 10 }}
                placeholder="What's wrong with the work? Be specific."
                value={disputeReason}
                onChange={e => setDisputeReason(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleDispute} disabled={disputing || !disputeReason.trim()} style={{ ...btn(D.danger), opacity: (disputing || !disputeReason.trim()) ? 0.5 : 1 }}>
                  {disputing ? "Submitting…" : "Submit dispute"}
                </button>
                <button onClick={() => setShowDisputeForm(false)} style={{ ...btn("transparent", D.textMuted, { border: `1px solid ${D.border}` }) }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </ActionCard>
      )}

      {/* ── Status alerts ── */}

      {deal.status === "PAYMENT_PENDING" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(59,130,246,0.14)", border: `1px solid ${D.blue}44`, borderLeft: `3px solid ${D.blue}`, marginBottom: 14 }}>
          <Clock size={15} color={D.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.blue, margin: 0 }}>The client is paying. We'll let you know once it's in.</p>
        </div>
      )}
      {deal.status === "PENDING" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(245,158,11,0.14)", border: `1px solid ${D.warning}44`, borderLeft: `3px solid ${D.warning}`, marginBottom: 14 }}>
          <Clock size={15} color={D.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.warning, margin: 0 }}>Waiting for the freelancer to accept the deal.</p>
        </div>
      )}
      {deal.status === "ACCEPTED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(59,130,246,0.14)", border: `1px solid ${D.blue}44`, borderLeft: `3px solid ${D.blue}`, marginBottom: 14 }}>
          <Clock size={15} color={D.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.blue, margin: 0 }}>Waiting for the client to pay.</p>
        </div>
      )}
      {deal.status === "FUNDED" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(139,92,246,0.14)", border: `1px solid ${D.purple}44`, borderLeft: `3px solid ${D.purple}`, marginBottom: 14 }}>
          <Clock size={15} color={D.purple} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.purple, margin: 0 }}>Paid. Waiting for the freelancer to do the work.</p>
        </div>
      )}
      {deal.status === "DELIVERED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(16,185,129,0.14)", border: `1px solid ${D.success}44`, borderLeft: `3px solid ${D.success}`, marginBottom: 14 }}>
          <Clock size={15} color={D.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.success, margin: 0 }}>Work delivered. Waiting for the client to review and approve.</p>
        </div>
      )}
      {(deal.status === "COMPLETE" || deal.status === "APPROVED") && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(16,185,129,0.14)", border: `1px solid ${D.success}44`, borderLeft: `3px solid ${D.success}`, marginBottom: 14 }}>
          <CheckCircle size={15} color={D.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.success, margin: 0, fontWeight: 500 }}>Payment sent. Payouts can take up to 2 business days.</p>
        </div>
      )}
      {deal.dispute && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, marginBottom: 14 }}>
          <AlertTriangle size={15} color={D.danger} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, color: D.danger, margin: "0 0 3px", fontWeight: 600 }}>
              Dispute raised {new Date(deal.dispute.raised_at).toLocaleDateString("en-ZA")}
            </p>
            <p style={{ fontSize: 12, color: "#FCA5A5", margin: 0 }}>{deal.dispute.reason}</p>
          </div>
        </div>
      )}

      {/* Deal details */}
      <div style={card()}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Deal Details
        </h3>
        <InfoRow label="Deal ID"       value={deal.deal_id}    mono />
        <InfoRow label="Client"        value={deal.client_email} />
        <InfoRow label="Freelancer"    value={deal.freelancer_email} />
        <InfoRow label="Amount"        value={fmt(deal.amount)}  mono />
        <InfoRow label="Days to deliver" value={`${deal.days_to_deliver} days`} />
        <InfoRow label="Fee paid by"   value={deal.fee_paid_by === "FREELANCER" ? "Freelancer" : "Client"} />
        <InfoRow label="Created"       value={new Date(deal.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />
        {deal.funded_at    && <InfoRow label="Funded"    value={new Date(deal.funded_at).toLocaleDateString("en-ZA",    { day: "numeric", month: "long", year: "numeric" })} />}
        {deal.delivered_at && <InfoRow label="Delivered" value={new Date(deal.delivered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />}

        {deal.description && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.surfaceHi}` }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Scope</p>
            <p style={{ fontSize: 13, color: D.textMuted, margin: 0, lineHeight: 1.6 }}>{deal.description}</p>
          </div>
        )}
      </div>

      {/* Message thread */}
      <MessageThread
        dealId={dealId}
        messages={deal.messages || []}
        currentUserId={currentUser?.user_id}
      />

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${D.blue}!important;outline:none;} *{box-sizing:border-box}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SmartDealList
// ─────────────────────────────────────────────────────────────────────────────

export function SmartDealList() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChoice, setShowChoice] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/smart-deals/")
      .then(r => setDeals(r.deals))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #2F81F4, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={16} color="#fff" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>Smart Deals</h1>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: 0 }}>Pay for work in stages</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setShowChoice(true)} style={{ ...btn(D.accent, "#fff") }}>
            + New Deal
          </button>
        </div>
      </div>

      {/* Choice screen — pick the deal type */}
      {showChoice && (
        <div
          onClick={() => setShowChoice(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,6,23,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ ...card({ marginBottom: 0 }), maxWidth: 460, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: D.text, margin: 0 }}>Start a new deal</h2>
              <button onClick={() => setShowChoice(false)} style={{ background: "none", border: "none", color: D.textMuted, cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 16px" }}>How do you want to get paid?</p>

            {[
              { icon: Lock, title: "Single payment", desc: "One payment for the whole job, released when the work is approved.", to: "/smart-deals/new" },
              { icon: Layers, title: "Paid in stages", desc: "Break the job into stages — the client pays and approves each one as you go.", to: "/smart-deals/new-milestone" },
            ].map(opt => (
              <button
                key={opt.to}
                onClick={() => { setShowChoice(false); navigate(opt.to); }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left",
                  padding: "14px 16px", marginBottom: 10, borderRadius: 12, cursor: "pointer",
                  background: D.surfaceHi, border: `1px solid ${D.border}`, color: D.text,
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <opt.icon size={16} color={D.blue} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: D.text, margin: "0 0 2px" }}>{opt.title}</p>
                  <p style={{ fontSize: 12, color: D.textMuted, margin: 0, lineHeight: 1.5 }}>{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero explanation */}
      <div style={{
        background: "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(30,41,59,0.65) 100%)",
        border: `1px solid ${D.borderLight}`,
        borderRadius: 14,
        padding: "20px 22px",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Zap size={16} color={D.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>Get paid in stages</span>
        </div>

        <p style={{ fontSize: 14, color: D.text, lineHeight: 1.65, margin: "0 0 16px" }}>
          Agree the stages and price upfront. We hold each payment safely and release it to the freelancer
          only when the client approves that stage.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { emoji: "🏗️", label: "Building & Construction" },
            { emoji: "💻", label: "Freelance Work" },
            { emoji: "🎨", label: "Design Projects" },
            { emoji: "🔧", label: "Home Renovations" },
          ].map(({ emoji, label }) => (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 20,
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.25)",
              fontSize: 12, fontWeight: 500, color: D.text,
            }}>
              {emoji} {label}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 11, color: D.textSoft, margin: "12px 0 0" }}>Pay as the work is done — money is only released when you approve each stage.</p>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${D.border}`, borderTopColor: D.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      )}

      {!loading && deals.length === 0 && (
        <div style={{ ...card({ textAlign: "center", padding: "48px 32px" }) }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: D.surfaceHi, border: `1px solid ${D.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Briefcase size={22} color={D.textSoft} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: D.text, margin: "0 0 6px" }}>No Smart Deals yet</h3>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 20px" }}>Set up a deal and get paid safely, stage by stage.</p>
          <button onClick={() => navigate("/smart-deals/new")} style={btn(D.blue)}>
            <Zap size={14} /> Create your first Smart Deal
          </button>
        </div>
      )}

      {!loading && deals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.map(d => (
            <div
              key={d.deal_id}
              onClick={() => navigate(`/smart-deals/${d.deal_id}`)}
              style={{ ...card({ marginBottom: 0, padding: "24px 26px", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }) }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = `0 4px 16px rgba(15,23,42,0.10)`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = D.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: D.text, margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.title}
                  </p>
                  <p style={{ fontSize: 12, color: D.textSoft, margin: 0 }}>
                    {d.client_email} → {d.freelancer_email}
                  </p>
                  {d.deal_type === "DIGITAL_WORK_MILESTONE" && d.milestone_count != null && (
                    <p style={{ fontSize: 11, color: D.accent, margin: "5px 0 0", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Layers size={11} /> Stage {d.milestones_released ?? 0} of {d.milestone_count} complete
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: D.accent, margin: "0 0 5px", fontFamily: "ui-monospace, monospace" }}>
                    R {Number(d.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                  </p>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone deals — shared helpers + components
// ─────────────────────────────────────────────────────────────────────────────

const fmtZAR = v => `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

// Per-stage fee math — the TrustTrade 2% fee. We do NOT add a payment-processing
// estimate (TradeSafe's exact bank fee is only known at checkout); a note tells the
// client a small bank fee is added then.
const round2 = v => Math.round(v * 100) / 100;
function milestoneMoney(amount, feePaidBy) {
  const amt = Number(amount) || 0;
  const fee = round2(amt * 0.02);          // TrustTrade fee (2%)
  const clientPays = (feePaidBy || "CLIENT").toUpperCase() !== "FREELANCER";
  return {
    fee,
    net: clientPays ? amt : round2(amt - fee),
    total: clientPays ? round2(amt + fee) : amt,
    clientPays,
  };
}

// ─── MilestoneFundPanel ───────────────────────────────────────────────────
// Buyer pays a single milestone into escrow. Mirrors FundPanel, scoped to one milestone.

function MilestoneFundPanel({ deal, milestone, reload }) {
  const [method, setMethod] = useState("eft");
  const [loading, setLoading] = useState(false);
  const [payConfirm, setPayConfirm] = useState(null);  // { link, total_value, processing_fee }
  const [err, setErr] = useState(null);
  const [eftDetails, setEftDetails] = useState(null);

  // Compute the breakdown fresh from the amount so it's consistent for both old and
  // new deals and always matches what TradeSafe will charge for this stage.
  const money = milestoneMoney(milestone.amount, deal.fee_paid_by);
  const platformFee = money.fee;
  const total = money.total;

  async function handleFund() {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/smart-deals/${deal.deal_id}/milestones/${milestone.milestone_id}/fund`, {
        method: "POST",
        body: JSON.stringify({ payment_method: method }),
      });
      if (res.payment_link) {
        if (res.total_value != null) {
          setPayConfirm({ link: res.payment_link, total_value: res.total_value, processing_fee: res.processing_fee });
          setLoading(false);
          return;
        }
        window.location.href = res.payment_link; return;
      }
      if (res.eft_details) { setEftDetails(res.eft_details); reload && reload(); return; }
      setErr(res.message || "Couldn't start the payment. Please try again or pick another method.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const confirmAndPay = () => { const pc = payConfirm; if (!pc) return; setPayConfirm(null); window.location.href = pc.link; };

  if (eftDetails) return <EftDetailsCard details={eftDetails} fallbackAmount={total} />;

  return (
    <div style={{ marginTop: 4 }}>
      <PaymentConfirmModal open={!!payConfirm} amount={payConfirm?.total_value} processingFee={payConfirm?.processing_fee} onConfirm={confirmAndPay} onCancel={() => setPayConfirm(null)} />
      <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>
        Pay for this stage now. <strong style={{ color: D.text }}>{deal.freelancer_name || "The freelancer"}</strong> only
        gets paid once <strong style={{ color: D.text }}>you approve</strong> the work. Payouts can take up to 2 business days.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {PAYMENT_METHODS.map(m => {
          const active = method === m.id;
          return (
            <label key={m.id} onClick={() => setMethod(m.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${active ? D.blue : D.border}`, background: active ? "rgba(59,130,246,0.14)" : D.surfaceHi, transition: "all 0.15s",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? D.blue : D.borderLight}`, background: active ? D.blue : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <m.Icon size={15} color={active ? D.blue : D.textMuted} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: D.text, margin: "0 0 1px" }}>{m.label}</p>
                <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{m.desc}</p>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: D.textMuted }}>This stage</span>
          <span style={{ fontSize: 12, color: D.text, fontFamily: "ui-monospace, monospace" }}>{fmtZAR(milestone.amount)}</span>
        </div>
        {money.clientPays && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: D.textMuted }}>TrustTrade fee (2%)</span>
            <span style={{ fontSize: 12, color: D.text, fontFamily: "ui-monospace, monospace" }}>{fmtZAR(platformFee)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${D.border}`, paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Total you pay now</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmtZAR(total)}</span>
        </div>
        <p style={{ fontSize: 11, color: D.textSoft, margin: "8px 0 0" }}>A small bank processing fee will be added at checkout.</p>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, color: D.danger, fontSize: 13, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <button onClick={handleFund} disabled={loading} style={{ ...btn(D.blue), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? <><Spinner /> Setting up payment…</> : <><Lock size={14} /> Pay this stage · {fmtZAR(total)}</>}
      </button>
    </div>
  );
}

// ─── MilestoneCard ──────────────────────────────────────────────────────────

function MilestoneCard({ deal, milestone, isClient, isFreelancer, reload }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const s = MS_STATUS[milestone.status] || { label: milestone.status, color: D.textMuted, bg: D.surface, dot: D.textSoft };
  const base = `/api/smart-deals/${deal.deal_id}/milestones/${milestone.milestone_id}`;

  async function act(path, label, body, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(label); setErr(null);
    try {
      await apiFetch(`${base}${path}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      await reload();
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }

  const accent =
    milestone.status === "DISPUTED" ? D.danger :
    milestone.status === "RELEASED" ? D.success :
    milestone.status === "DELIVERED" ? D.purple :
    milestone.status === "FUNDED" ? D.success :
    milestone.status === "AWAITING_PAYMENT" ? D.blue : D.border;

  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: "16px 18px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>
            Stage {milestone.seq}
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: D.text, margin: 0, lineHeight: 1.45, wordBreak: "break-word" }}>
            {milestone.description}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: D.accent, margin: "0 0 5px", fontFamily: "ui-monospace, monospace" }}>
            {fmtZAR(milestone.amount)}
          </p>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
            padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.dot}33`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
            {s.label}
          </span>
        </div>
      </div>

      {err && (
        <div style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, color: D.danger, fontSize: 12, margin: "8px 0" }}>
          {err}
        </div>
      )}

      {/* Buyer: pay this milestone */}
      {isClient && milestone.status === "AWAITING_PAYMENT" && (
        <MilestoneFundPanel deal={deal} milestone={milestone} reload={reload} />
      )}

      {/* Buyer: awaiting payment confirmation */}
      {isClient && milestone.status === "PAYMENT_PENDING" && (
        <div style={{ marginTop: 6 }}>
          {milestone.eft_details && <EftDetailsCard details={milestone.eft_details} fallbackAmount={milestone.total ?? milestone.amount} />}
          <p style={{ fontSize: 13, color: D.textMuted, margin: "6px 0 12px", lineHeight: 1.5 }}>
            {milestone.eft_details
              ? "Once you've paid using the details above, it can take 1–2 business days to show. This page updates on its own."
              : "Waiting for your payment to come through. This page updates on its own."}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {milestone.payment_link && (
              <a href={milestone.payment_link} target="_blank" rel="noopener noreferrer" style={{ ...btn(D.blue, "#fff"), textDecoration: "none" }}>
                <Lock size={14} /> Resume payment
              </a>
            )}
            <button onClick={() => act("/cancel-payment", "cancel", null)} disabled={busy === "cancel"}
              style={{ ...btn("transparent", D.textMuted, { border: `1px solid ${D.border}`, opacity: busy === "cancel" ? 0.6 : 1 }) }}>
              {busy === "cancel" ? <><Spinner /> Resetting…</> : "Change payment method"}
            </button>
          </div>
        </div>
      )}

      {/* Seller: mark delivered */}
      {isFreelancer && milestone.status === "FUNDED" && (
        <button onClick={() => act("/deliver", "deliver", null, "Mark this stage as done? We'll let the client know to review it.")}
          disabled={busy === "deliver"} style={{ ...btn(D.purple), marginTop: 6, opacity: busy === "deliver" ? 0.6 : 1 }}>
          {busy === "deliver" ? <><Spinner /> Submitting…</> : <><CheckCircle size={14} /> Mark stage done</>}
        </button>
      )}

      {/* Buyer: approve / dispute */}
      {isClient && milestone.status === "DELIVERED" && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => act("/approve", "approve", null, "Approve this stage and pay the freelancer? Payouts can take up to 2 business days.")}
              disabled={busy === "approve"} style={{ ...btn(D.success), flex: 1, minWidth: 160, opacity: busy === "approve" ? 0.6 : 1 }}>
              {busy === "approve" ? <><Spinner /> Releasing…</> : <><CheckCircle size={14} /> Approve & pay</>}
            </button>
            <button onClick={() => setShowDispute(v => !v)} style={{ ...btn(D.danger), minWidth: 100 }}>
              <AlertTriangle size={14} /> Dispute
            </button>
          </div>
          {showDispute && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.success}33` }}>
              <label style={{ ...label, marginBottom: 8 }}>What's wrong with this stage?</label>
              <textarea style={{ ...textarea, marginBottom: 10 }} placeholder="Be specific so we can help resolve it quickly."
                value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => act("/dispute", "dispute", { reason: disputeReason })}
                  disabled={busy === "dispute" || disputeReason.trim().length < 10}
                  style={{ ...btn(D.danger), opacity: (busy === "dispute" || disputeReason.trim().length < 10) ? 0.5 : 1 }}>
                  {busy === "dispute" ? "Submitting…" : "Submit dispute"}
                </button>
                <button onClick={() => setShowDispute(false)} style={{ ...btn("transparent", D.textMuted, { border: `1px solid ${D.border}` }) }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status notes */}
      {isFreelancer && milestone.status === "PAYMENT_PENDING" && (
        <p style={{ fontSize: 12, color: D.blue, margin: "6px 0 0" }}>The client is paying for this stage. We'll let you know once it's paid.</p>
      )}
      {isFreelancer && milestone.status === "DELIVERED" && (
        <p style={{ fontSize: 12, color: D.success, margin: "6px 0 0" }}>Done — waiting for the client to check and approve.</p>
      )}
      {isClient && milestone.status === "FUNDED" && (
        <p style={{ fontSize: 12, color: D.success, margin: "6px 0 0" }}>Paid. Waiting for {deal.freelancer_name || "the freelancer"} to do this stage.</p>
      )}
      {milestone.status === "RELEASED" && (
        <p style={{ fontSize: 12, color: D.success, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle size={13} /> Approved — payment sent (can take up to 2 business days).
        </p>
      )}
      {milestone.status === "PROPOSED" && (
        <p style={{ fontSize: 12, color: D.textSoft, margin: "6px 0 0" }}>You'll pay for this once the previous stage is approved.</p>
      )}
      {milestone.status === "DISPUTED" && milestone.dispute && (
        <p style={{ fontSize: 12, color: "#FCA5A5", margin: "6px 0 0" }}>
          On hold — disputed: {milestone.dispute.reason}
        </p>
      )}
    </div>
  );
}

// ─── MilestoneDealView ────────────────────────────────────────────────────

function MilestoneDealView({ deal, currentUser, isClient, isFreelancer, reload }) {
  const [approvingStructure, setApprovingStructure] = useState(false);
  const [actionError, setActionError] = useState(null);

  const milestones = [...(deal.milestones || [])].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const released = milestones.filter(m => m.status === "RELEASED").length;
  const sellerName = deal.freelancer_name || deal.freelancer_email || "The seller";

  const DEAL_LABEL = {
    PROPOSED: "Awaiting your approval",
    STRUCTURE_APPROVED: "Approved — pay the first stage",
    IN_PROGRESS: `Stage ${released} of ${milestones.length} complete`,
    COMPLETE: "All stages complete",
    DISPUTED: "A stage is disputed",
  };
  const dealColor = deal.status === "DISPUTED" ? D.danger : deal.status === "COMPLETE" ? D.success : D.blue;

  async function approveStructure() {
    if (!window.confirm("Approve these stages? You'll pay one at a time, starting with the first.")) return;
    setApprovingStructure(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${deal.deal_id}/approve-structure`, { method: "POST" }); await reload(); }
    catch (e) { setActionError(e.message); } finally { setApprovingStructure(false); }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: D.textMuted, textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Layers size={16} color={D.accent} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0, wordBreak: "break-word" }}>{deal.title}</h1>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
            padding: "3px 10px", borderRadius: 20, background: `${dealColor}1A`, color: dealColor, border: `1px solid ${dealColor}33`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dealColor }} />
            {DEAL_LABEL[deal.status] || deal.status}
          </span>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmtZAR(deal.amount)}</div>
          <div style={{ fontSize: 11, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {milestones.length} stages
          </div>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
          {actionError}
        </div>
      )}

      {/* Buyer: review & approve the structure (plain-English invite copy) */}
      {isClient && deal.status === "PROPOSED" && (
        <ActionCard accent={D.accent}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Shield size={16} color={D.accent} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Review &amp; approve to get started</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 10px", lineHeight: 1.6 }}>
            <strong style={{ color: D.text }}>{sellerName}</strong> has sent you a deal in {milestones.length} stages. Approve it to start.
            You pay one stage at a time, and we hold your money safely until you say the work is done.
          </p>
          <p style={{ fontSize: 12, color: D.textSoft, margin: "0 0 14px", lineHeight: 1.6 }}>
            You'll see the exact amount, plus our 2% fee, before every payment — no surprises.
          </p>
          <button onClick={approveStructure} disabled={approvingStructure} style={{ ...btn(D.accent, "#fff"), opacity: approvingStructure ? 0.6 : 1 }}>
            {approvingStructure ? <><Spinner /> Approving…</> : <><CheckCircle size={14} /> Approve &amp; start</>}
          </button>
        </ActionCard>
      )}

      {/* Seller: waiting for buyer approval */}
      {isFreelancer && deal.status === "PROPOSED" && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(245,158,11,0.14)", border: `1px solid ${D.warning}44`, borderLeft: `3px solid ${D.warning}`, marginBottom: 14 }}>
          <Clock size={15} color={D.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.warning, margin: 0 }}>
            Waiting for {deal.client_name || "your client"} to review and approve. They'll pay the first stage to start.
          </p>
        </div>
      )}

      {/* Completed banner */}
      {deal.status === "COMPLETE" && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(16,185,129,0.14)", border: `1px solid ${D.success}44`, borderLeft: `3px solid ${D.success}`, marginBottom: 14 }}>
          <CheckCircle size={15} color={D.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.success, margin: 0, fontWeight: 500 }}>All stages approved and paid out. This deal is complete.</p>
        </div>
      )}

      {/* Progress summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: D.surfaceHi, borderRadius: 12, marginBottom: 14, border: `1px solid ${D.border}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: D.text }}>Progress</span>
            <span style={{ fontSize: 12, color: D.textMuted }}>Stage {released} of {milestones.length} complete</span>
          </div>
          <div style={{ height: 6, background: D.bg, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${milestones.length ? (released / milestones.length) * 100 : 0}%`, height: "100%", background: D.success, borderRadius: 6, transition: "width 0.3s" }} />
          </div>
        </div>
      </div>

      {/* Milestones */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Stages
      </h3>
      {milestones.map(m => (
        <MilestoneCard key={m.milestone_id} deal={deal} milestone={m} isClient={isClient} isFreelancer={isFreelancer} reload={reload} />
      ))}

      {/* Deal details */}
      <div style={card({ marginTop: 4 })}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Deal Details
        </h3>
        <InfoRow label="Deal ID" value={deal.deal_id} mono />
        <InfoRow label="Client (pays)" value={deal.client_email} />
        <InfoRow label="Freelancer (gets paid)" value={deal.freelancer_email} />
        <InfoRow label="Total value" value={fmtZAR(deal.amount)} mono />
        <InfoRow label="Fee paid by" value={deal.fee_paid_by === "FREELANCER" ? "Freelancer" : "Client"} />
        <InfoRow label="Created" value={new Date(deal.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />
        {deal.description && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.surfaceHi}` }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Scope</p>
            <p style={{ fontSize: 13, color: D.textMuted, margin: 0, lineHeight: 1.6 }}>{deal.description}</p>
          </div>
        )}
      </div>

      <MessageThread dealId={deal.deal_id} messages={deal.messages || []} currentUserId={currentUser?.user_id} />

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${D.blue}!important;outline:none;} *{box-sizing:border-box}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateMilestoneDeal (seller-initiated)
// ─────────────────────────────────────────────────────────────────────────────

export function CreateMilestoneDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", buyer_email: "", fee_paid_by: "CLIENT" });
  const [milestones, setMilestones] = useState([
    { description: "", amount: "" },
    { description: "", amount: "" },
  ]);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setMs = (i, k) => e => setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [k]: e.target.value } : m));
  const addMs = () => setMilestones(ms => ms.length < 20 ? [...ms, { description: "", amount: "" }] : ms);
  const removeMs = i => setMilestones(ms => ms.length > 1 ? ms.filter((_, idx) => idx !== i) : ms);

  const total = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = "Required";
    if (!form.buyer_email.includes("@")) e.buyer_email = "Enter a valid email";
    milestones.forEach((m, i) => {
      if (!m.description.trim()) e[`ms_desc_${i}`] = "Describe this milestone";
      const amt = Number(m.amount);
      if (!m.amount || isNaN(amt) || amt <= 0) e[`ms_amt_${i}`] = "Enter an amount";
      else if (amt < MIN_TRANSACTION_AMOUNT) e[`ms_amt_${i}`] = `Min R${MIN_TRANSACTION_AMOUNT} per stage`;
    });
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true); setApiError(null);
    try {
      const res = await apiFetch("/api/smart-deals/milestone-deals", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          buyer_email: form.buyer_email,
          fee_paid_by: form.fee_paid_by,
          milestones: milestones.map(m => ({ description: m.description, amount: Number(m.amount) })),
        }),
      });
      navigate(`/smart-deals/${res.deal_id}`);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fieldErr = k => errors[k] ? <p style={{ fontSize: 11, color: D.danger, margin: "2px 0 8px" }}>{errors[k]}</p> : null;
  const borderErr = k => errors[k] ? D.danger : D.border;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: D.textMuted, textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2F81F4, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={17} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>New Project Deal</h1>
        </div>
      </div>

      {/* Seller explainer — plain English */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 12, background: "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(30,41,59,0.65) 100%)", border: `1px solid ${D.borderLight}`, marginBottom: 18 }}>
        <Zap size={16} color={D.accent} style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: D.text, margin: 0, lineHeight: 1.6 }}>
          Get paid in stages. Your client pays for each stage before you start it, and we hold the money safely.
          You're paid as soon as they approve the work — and they can't unfairly hold it back.
        </p>
      </div>

      {apiError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
          {apiError}
        </div>
      )}

      <div style={card()}>
        <div style={{ marginBottom: 4 }}>
          <label style={label}>Deal Title</label>
          <input style={{ ...input, borderColor: borderErr("title") }} placeholder="e.g. Website build for Acme Co" value={form.title} onChange={set("title")} />
          {fieldErr("title")}
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={label}>Overview (optional)</label>
          <textarea style={{ ...textarea }} placeholder="A short summary of the whole project…" value={form.description} onChange={set("description")} />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={label}>Client Email</label>
          <input style={{ ...input, borderColor: borderErr("buyer_email") }} type="email" placeholder="client@example.com" value={form.buyer_email} onChange={set("buyer_email")} />
          {fieldErr("buyer_email")}
        </div>

        {/* Milestones */}
        <label style={{ ...label, marginTop: 8 }}>Stages</label>
        <p style={{ fontSize: 12, color: D.textMuted, margin: "0 0 12px" }}>
          Break the work into stages. Each stage is paid for separately, so each must be at least R{MIN_TRANSACTION_AMOUNT}.
        </p>

        {milestones.map((m, i) => (
          <div key={i} style={{ background: D.surfaceHi, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: D.textSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stage {i + 1}</span>
              {milestones.length > 1 && (
                <button onClick={() => removeMs(i)} style={{ background: "none", border: "none", color: D.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: 0 }}>
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
            <input style={{ ...input, marginBottom: 8, borderColor: borderErr(`ms_desc_${i}`) }} placeholder="e.g. 50% deposit to start work" value={m.description} onChange={setMs(i, "description")} />
            {fieldErr(`ms_desc_${i}`)}
            <input style={{ ...input, fontFamily: "ui-monospace, monospace", fontWeight: 600, marginBottom: 4, borderColor: borderErr(`ms_amt_${i}`) }} type="number" min={MIN_TRANSACTION_AMOUNT} placeholder="Amount (ZAR)" value={m.amount} onChange={setMs(i, "amount")} />
            {fieldErr(`ms_amt_${i}`)}
          </div>
        ))}

        {milestones.length < 20 && (
          <button onClick={addMs} style={{ ...btn("transparent", D.accent, { border: `1px dashed ${D.accent}66`, width: "100%", marginBottom: 14 }) }}>
            <Plus size={14} /> Add another stage
          </button>
        )}

        {/* Running total */}
        <div style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Total deal value</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmtZAR(total)}</span>
          </div>
          <p style={{ fontSize: 11, color: D.textMuted, margin: "6px 0 0" }}>The total of all stages. Your client pays one stage at a time.</p>
        </div>

        {/* Honest heads-up about per-stage processing fees, with a cheaper alternative */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,0.14)", border: `1px solid ${D.warning}44`, marginBottom: 16 }}>
          <AlertTriangle size={14} color={D.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: D.text, margin: 0, lineHeight: 1.5 }}>
            Each stage is processed as a separate payment, so a 2-stage deal has 2 bank processing fees.
            {" "}<strong>Tip: want to pay less fees?</strong> Use a{" "}
            <Link to="/transactions/new" style={{ color: D.blue, fontWeight: 600 }}>single payment transaction</Link>
            {" "}instead — same protection, one fee.
          </p>
        </div>

        {/* Fee payer */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ ...label, marginBottom: 10 }}>Who pays the TrustTrade fee?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { value: "CLIENT", title: "Client pays", desc: "Fee added to each stage" },
              { value: "FREELANCER", title: "I pay (freelancer)", desc: "Fee deducted from each payout" },
            ].map(opt => {
              const active = form.fee_paid_by === opt.value;
              return (
                <label key={opt.value} onClick={() => setForm(f => ({ ...f, fee_paid_by: opt.value }))} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10,
                  border: `1.5px solid ${active ? D.blue : D.border}`, background: active ? "rgba(59,130,246,0.14)" : D.surfaceHi, cursor: "pointer",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${active ? D.blue : D.borderLight}`, background: active ? D.blue : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: D.text, margin: "0 0 2px" }}>{opt.title}</p>
                    <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(D.accent, "#fff"), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? <><Spinner /> Creating…</> : <><Layers size={14} /> Send Smart Deal to client</>}
        </button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${D.blue}!important;box-shadow:0 0 0 3px ${D.blue}22;} *{box-sizing:border-box}`}</style>
    </div>
  );
}

export default SmartDealDetail;
