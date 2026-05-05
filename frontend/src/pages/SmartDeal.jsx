import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle, Clock, Briefcase, Shield,
  AlertTriangle, Zap, ArrowRight, Send,
  MessageSquare, Lock, CreditCard, Landmark, Bolt,
} from "lucide-react";

const API = process.env.REACT_APP_API_URL || "https://trusttrade-backend-production-3efa.up.railway.app";

const D = {
  bg:           "#070D18",
  surface:      "#0D1526",
  surfaceHi:    "#121D33",
  border:       "#1A2A45",
  borderLight:  "#1E3254",
  text:         "#E2E8F0",
  textMuted:    "#8892A4",
  textSoft:     "#4E6080",
  accent:       "#00D1FF",
  blue:         "#3B82F6",
  success:      "#10B981",
  warning:      "#F59E0B",
  danger:       "#EF4444",
  orange:       "#F97316",
  purple:       "#8B5CF6",
};

const STATUS = {
  PENDING:   { label: "Waiting for freelancer to accept",        color: "#D97706", bg: "#1A1200", dot: "#F59E0B" },
  ACCEPTED:  { label: "Fund escrow to start work",               color: "#3B82F6", bg: "#071428", dot: "#3B82F6" },
  FUNDED:    { label: "Freelancer is working",                    color: "#10B981", bg: "#041A0F", dot: "#10B981" },
  DELIVERED: { label: "Review and approve to release payment",    color: "#8B5CF6", bg: "#100820", dot: "#8B5CF6" },
  APPROVED:  { label: "Complete",                                color: "#10B981", bg: "#041A0F", dot: "#10B981" },
  COMPLETE:  { label: "Complete",                                color: "#10B981", bg: "#041A0F", dot: "#10B981" },
  DISPUTED:  { label: "Admin investigating",                     color: "#EF4444", bg: "#1A0808", dot: "#EF4444" },
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
  const stepLabels = { PENDING: "Created", ACCEPTED: "Accepted", FUNDED: "Funded", DELIVERED: "Delivered", COMPLETE: "Done" };
  const cur = status === "DISPUTED" ? "DELIVERED" : status;
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

// ─── FundPanel ────────────────────────────────────────────────────────────

function FundPanel({ deal, onFunded }) {
  const [method, setMethod] = useState("eft");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [payLink, setPayLink] = useState(null);

  const selected = PAYMENT_METHODS.find(m => m.id === method);
  const fee = deal.amount * (selected.fee / 100);
  const total = deal.amount + fee;
  const fmt = v => `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  async function handleFund() {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/smart-deals/${deal.deal_id}/fund`, {
        method: "POST",
        body: JSON.stringify({ payment_method: method }),
      });
      if (res.payment_link) {
        setPayLink(res.payment_link);
      } else {
        onFunded();
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (payLink) {
    return (
      <ActionCard accent={D.blue}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Lock size={15} color={D.accent} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Complete your payment</h3>
        </div>
        <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 16px", lineHeight: 1.5 }}>
          Your escrow has been created. Click below to complete payment via <strong style={{ color: D.text }}>{selected.label}</strong>.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={payLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onFunded}
            style={{ ...btn(D.accent, "#000"), textDecoration: "none" }}
          >
            <Lock size={14} /> Pay {fmt(total)} Now
          </a>
          <button onClick={onFunded} style={{ ...btn("transparent", D.textMuted, { border: `1px solid ${D.border}` }) }}>
            I've paid
          </button>
        </div>
      </ActionCard>
    );
  }

  return (
    <ActionCard accent={D.blue}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Lock size={15} color={D.blue} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Fund Secure Vault Escrow</h3>
      </div>
      <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 16px", lineHeight: 1.5 }}>
        Choose a payment method. Funds are held in TradeSafe Escrow and only released when <strong style={{ color: D.text }}>you approve</strong> the delivery.
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
                background: active ? "#071428" : D.surfaceHi,
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
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? D.blue : D.textMuted, flexShrink: 0 }}>
                {m.fee === 0 ? "No fee" : `+${m.fee}%`}
              </span>
            </label>
          );
        })}
      </div>

      {/* Payment summary */}
      <div style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: D.textMuted }}>Escrow amount</span>
          <span style={{ fontSize: 12, color: D.text, fontFamily: "ui-monospace, monospace" }}>{fmt(deal.amount)}</span>
        </div>
        {fee > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: D.textMuted }}>Processing fee ({selected.fee}%)</span>
            <span style={{ fontSize: 12, color: D.warning, fontFamily: "ui-monospace, monospace" }}>{fmt(fee)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${D.border}`, paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: D.accent, fontFamily: "ui-monospace, monospace" }}>{fmt(total)}</span>
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#1A0808", border: `1px solid ${D.danger}44`, color: D.danger, fontSize: 13, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <button
        onClick={handleFund}
        disabled={loading}
        style={{ ...btn(D.blue), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? <><Spinner /> Creating escrow…</> : <><Lock size={14} /> Fund {fmt(total)}</>}
      </button>
    </ActionCard>
  );
}

// ─── MessageThread ────────────────────────────────────────────────────────

function MessageThread({ dealId, messages, currentUserId }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState(messages);
  const bottomRef = useRef(null);

  useEffect(() => { setLocalMessages(messages); }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
                <p style={{ fontSize: 13, color: D.text, margin: 0, lineHeight: 1.4, wordBreak: "break-word" }}>{m.content}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "3px 0 0", textAlign: mine ? "right" : "left" }}>
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
    if (!form.freelancer_email.includes("@")) e.freelancer_email = "Enter a valid email";
    if (!form.days_to_deliver || Number(form.days_to_deliver) <= 0) e.days_to_deliver = "Required";
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true); setApiError(null);
    try {
      const res = await apiFetch("/api/smart-deals/", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount), days_to_deliver: Number(form.days_to_deliver) }),
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
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Briefcase size={17} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>New Smart Deal</h1>
        </div>
        <p style={{ fontSize: 13, color: D.textMuted, margin: 0 }}>
          Funds held in Secure Vault escrow. Payment is only released when you approve the delivery.
        </p>
      </div>

      {apiError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#1A0808", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
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
            <input style={{ ...input, fontFamily: "ui-monospace, monospace", fontWeight: 600, borderColor: borderErr("amount") }} type="number" placeholder="5 000" value={form.amount} onChange={set("amount")} />
            {fieldErr("amount")}
          </div>
          <div>
            <label style={label}>Days to Deliver</label>
            <input style={{ ...input, borderColor: borderErr("days_to_deliver") }} type="number" placeholder="7" value={form.days_to_deliver} onChange={set("days_to_deliver")} />
            {fieldErr("days_to_deliver")}
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
                  background: active ? "#071428" : D.surfaceHi, cursor: "pointer",
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

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#070D18", border: `1px solid ${D.accent}33`, marginBottom: 18 }}>
          <Shield size={15} color={D.accent} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: D.textMuted, margin: 0, lineHeight: 1.5 }}>
            Your freelancer will accept, you fund the Secure Vault, they deliver, and you approve to release payment. No auto-release — you stay in control.
          </p>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(D.accent, "#000"), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
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
    const ACTIVE = new Set(["PENDING", "ACCEPTED", "FUNDED", "DELIVERED"]);
    if (!deal || !ACTIVE.has(deal.status)) return;
    const id = setInterval(() => {
      apiFetch(`/api/smart-deals/${dealId}`)
        .then(d => setDeal(d))
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
    if (!window.confirm("Approve this deliverable and release payment to the freelancer?")) return;
    setApproving(true); setActionError(null);
    try { await apiFetch(`/api/smart-deals/${dealId}/approve`, { method: "POST" }); await load(); }
    catch (e) { setActionError(e.message); } finally { setApproving(false); }
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
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "#1A0808", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13 }}>
        {error}
      </div>
    </div>
  );

  if (!deal) return null;

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
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#1A0808", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, color: D.danger, fontSize: 13, marginBottom: 14 }}>
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
            Review the scope and amount. Once you accept, the client funds escrow and work begins.
          </p>
          <button onClick={handleAccept} disabled={accepting} style={{ ...btn(D.orange), opacity: accepting ? 0.6 : 1 }}>
            {accepting ? <><Spinner /> Accepting…</> : <>Accept deal <ArrowRight size={14} /></>}
          </button>
        </ActionCard>
      )}

      {/* Client: fund escrow */}
      {isClient && deal.status === "ACCEPTED" && (
        <FundPanel deal={deal} onFunded={load} />
      )}

      {/* Freelancer: mark as delivered */}
      {isFreelancer && deal.status === "FUNDED" && (
        <ActionCard accent={D.purple}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={D.purple} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Mark as delivered</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            When your work is complete, mark it as delivered. The client will review and manually approve to release payment.
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
            <h3 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Review the deliverable</h3>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
            Approve to release payment to the freelancer. Not satisfied? Raise a dispute and admin will investigate.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleApprove} disabled={approving} style={{ ...btn(D.success), flex: 1, minWidth: 160, opacity: approving ? 0.6 : 1 }}>
              {approving ? <><Spinner /> Releasing…</> : <><CheckCircle size={14} /> Approve & release payment</>}
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
                placeholder="What's wrong with the deliverable? Be specific."
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

      {deal.status === "PENDING" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#1A1200", border: `1px solid ${D.warning}44`, borderLeft: `3px solid ${D.warning}`, marginBottom: 14 }}>
          <Clock size={15} color={D.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.warning, margin: 0 }}>Waiting for the freelancer to accept the deal.</p>
        </div>
      )}
      {deal.status === "ACCEPTED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#071428", border: `1px solid ${D.blue}44`, borderLeft: `3px solid ${D.blue}`, marginBottom: 14 }}>
          <Clock size={15} color={D.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.blue, margin: 0 }}>Waiting for the client to fund the escrow.</p>
        </div>
      )}
      {deal.status === "FUNDED" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#100820", border: `1px solid ${D.purple}44`, borderLeft: `3px solid ${D.purple}`, marginBottom: 14 }}>
          <Clock size={15} color={D.purple} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.purple, margin: 0 }}>Escrow funded. Waiting for the freelancer to deliver.</p>
        </div>
      )}
      {deal.status === "DELIVERED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#041A0F", border: `1px solid ${D.success}44`, borderLeft: `3px solid ${D.success}`, marginBottom: 14 }}>
          <Clock size={15} color={D.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.success, margin: 0 }}>Work delivered. Waiting for the client to review and approve.</p>
        </div>
      )}
      {(deal.status === "COMPLETE" || deal.status === "APPROVED") && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#041A0F", border: `1px solid ${D.success}44`, borderLeft: `3px solid ${D.success}`, marginBottom: 14 }}>
          <CheckCircle size={15} color={D.success} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: D.success, margin: 0, fontWeight: 500 }}>Deal complete — payment has been released to the freelancer.</p>
        </div>
      )}
      {deal.dispute && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#1A0808", border: `1px solid ${D.danger}44`, borderLeft: `3px solid ${D.danger}`, marginBottom: 14 }}>
          <AlertTriangle size={15} color={D.danger} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, color: D.danger, margin: "0 0 3px", fontWeight: 600 }}>
              Dispute raised {new Date(deal.dispute.raised_at).toLocaleDateString("en-ZA")}
            </p>
            <p style={{ fontSize: 12, color: "#ff9999", margin: 0 }}>{deal.dispute.reason}</p>
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
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/smart-deals/")
      .then(r => setDeals(r.deals))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={16} color="#fff" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>Smart Deals</h1>
          </div>
          <p style={{ fontSize: 13, color: D.textMuted, margin: 0 }}>Secure Vault escrow-protected digital work</p>
        </div>
        <button onClick={() => navigate("/smart-deals/new")} style={{ ...btn(D.blue) }}>
          + New Deal
        </button>
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
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 20px" }}>Create a Secure Vault escrow deal for your freelance work.</p>
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
              style={{ ...card({ marginBottom: 0, cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }) }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.4)`; }}
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

export default SmartDealDetail;
