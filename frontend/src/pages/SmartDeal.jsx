import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, Briefcase, DollarSign, User, Calendar, FileText, AlertTriangle, Shield, Zap, ArrowRight } from "lucide-react";

const API = process.env.REACT_APP_API_URL || "https://trusttrade-backend-production-3efa.up.railway.app";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

const STATUS = {
  PENDING:   { label: "Awaiting freelancer", color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  ACCEPTED:  { label: "Awaiting payment",    color: "#1e40af", bg: "#eff6ff", dot: "#3b82f6" },
  FUNDED:    { label: "In progress",         color: "#065f46", bg: "#ecfdf5", dot: "#10b981" },
  DELIVERED: { label: "Ready for review",    color: "#4c1d95", bg: "#f5f3ff", dot: "#8b5cf6" },
  APPROVED:  { label: "Approved",            color: "#065f46", bg: "#ecfdf5", dot: "#10b981" },
  COMPLETE:  { label: "Complete",            color: "#065f46", bg: "#ecfdf5", dot: "#10b981" },
  DISPUTED:  { label: "In dispute",          color: "#7f1d1d", bg: "#fef2f2", dot: "#ef4444" },
};

const S = {
  page: { maxWidth: 700, margin: "0 auto", paddingBottom: 40 },
  card: {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
    padding: "20px 22px",
    marginBottom: 14,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#0f172a",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
    marginBottom: 14,
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#0f172a",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: 90,
    marginBottom: 14,
    transition: "border-color 0.15s",
  },
  actionCard: (accent, bg) => ({
    background: bg,
    border: `1px solid ${accent}33`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 14,
    boxShadow: `0 2px 12px ${accent}11`,
  }),
  btn: (bg, color = "#fff") => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "10px 20px",
    borderRadius: 9,
    border: "none",
    background: bg,
    color,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  }),
  pill: (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
    background: bg,
    color,
  }),
};

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, color: "#475569", bg: "#f8fafc", dot: "#94a3b8" };
  return (
    <span style={{ ...S.pill(s.bg, s.color) }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function ProgressTracker({ status }) {
  const steps = ["PENDING", "ACCEPTED", "FUNDED", "DELIVERED", "COMPLETE"];
  const labels = { PENDING: "Created", ACCEPTED: "Accepted", FUNDED: "Funded", DELIVERED: "Delivered", COMPLETE: "Complete" };
  const current = status === "DISPUTED" ? "DELIVERED" : status;
  const currentIdx = steps.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", background: "#f8fafc", borderRadius: 12, marginBottom: 14 }}>
      {steps.map((step, i) => (
        <div key={step} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: i < currentIdx ? "#10b981" : i === currentIdx ? "#3b82f6" : "#fff",
              color: i <= currentIdx ? "#fff" : "#94a3b8",
              border: `2px solid ${i < currentIdx ? "#10b981" : i === currentIdx ? "#3b82f6" : "#e2e8f0"}`,
              transition: "all 0.2s",
            }}>
              {i < currentIdx ? <CheckCircle size={13} /> : i + 1}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: i <= currentIdx ? "#0f172a" : "#94a3b8",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}>
              {labels[step]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 6px",
              marginBottom: 20,
              background: i < currentIdx ? "#10b981" : "#e2e8f0",
              borderRadius: 2,
              transition: "background 0.3s",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f8fafc" }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", fontFamily: mono ? "ui-monospace, monospace" : "inherit", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateSmartDeal
// ─────────────────────────────────────────────────────────────────────────────
export function CreateSmartDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    amount: "",
    freelancer_email: "",
    days_to_deliver: "",
    fee_paid_by: "CLIENT",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

  return (
    <div style={S.page}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Briefcase size={17} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>New Smart Deal</h1>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Funds held in escrow. Client approves the work to release payment to the freelancer.
        </p>
      </div>

      {apiError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", color: "#7f1d1d", fontSize: 13, marginBottom: 14 }}>
          {apiError}
        </div>
      )}

      <div style={S.card}>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Deal Title</label>
          <input
            style={{ ...S.input, marginBottom: 4, borderColor: errors.title ? "#ef4444" : "#e2e8f0" }}
            placeholder="e.g. Logo design for Acme Co"
            value={form.title}
            onChange={set("title")}
          />
          {errors.title && <p style={{ fontSize: 11, color: "#ef4444", margin: "2px 0 10px" }}>{errors.title}</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Scope of Work</label>
          <textarea
            style={{ ...S.textarea, marginBottom: 4, borderColor: errors.description ? "#ef4444" : "#e2e8f0" }}
            placeholder="Describe exactly what will be delivered, including any acceptance criteria..."
            value={form.description}
            onChange={set("description")}
          />
          {errors.description && <p style={{ fontSize: 11, color: "#ef4444", margin: "2px 0 10px" }}>{errors.description}</p>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Amount (ZAR)</label>
            <input
              style={{ ...S.input, fontFamily: "ui-monospace, monospace", fontWeight: 600, marginBottom: 4, borderColor: errors.amount ? "#ef4444" : "#e2e8f0" }}
              type="number"
              placeholder="5 000"
              value={form.amount}
              onChange={set("amount")}
            />
            {errors.amount && <p style={{ fontSize: 11, color: "#ef4444", margin: "2px 0 0" }}>{errors.amount}</p>}
          </div>
          <div>
            <label style={S.label}>Days to Deliver</label>
            <input
              style={{ ...S.input, marginBottom: 4, borderColor: errors.days_to_deliver ? "#ef4444" : "#e2e8f0" }}
              type="number"
              placeholder="7"
              value={form.days_to_deliver}
              onChange={set("days_to_deliver")}
            />
            {errors.days_to_deliver && <p style={{ fontSize: 11, color: "#ef4444", margin: "2px 0 0" }}>{errors.days_to_deliver}</p>}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Freelancer Email</label>
          <input
            style={{ ...S.input, marginBottom: 4, borderColor: errors.freelancer_email ? "#ef4444" : "#e2e8f0" }}
            type="email"
            placeholder="freelancer@example.com"
            value={form.freelancer_email}
            onChange={set("freelancer_email")}
          />
          {errors.freelancer_email && <p style={{ fontSize: 11, color: "#ef4444", margin: "2px 0 10px" }}>{errors.freelancer_email}</p>}
        </div>

        {/* Fee paid by */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ ...S.label, marginBottom: 10 }}>Who pays the TrustTrade fee?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { value: "CLIENT", title: "I pay (client)", desc: "Fee deducted from your payment" },
              { value: "FREELANCER", title: "Freelancer pays", desc: "Fee deducted from payout" },
            ].map(opt => {
              const active = form.fee_paid_by === opt.value;
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${active ? "#3b82f6" : "#e2e8f0"}`,
                    background: active ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onClick={() => setForm(f => ({ ...f, fee_paid_by: opt.value }))}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${active ? "#3b82f6" : "#cbd5e1"}`,
                    background: active ? "#3b82f6" : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
                    {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: "0 0 2px" }}>{opt.title}</p>
                    <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Info banner */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", marginBottom: 18 }}>
          <Shield size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#1e3a8a", margin: 0, lineHeight: 1.5 }}>
            Once created, your freelancer accepts, you fund escrow, they do the work, and you approve to release payment.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...S.btn("#3b82f6"), width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? (
            <>
              <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Creating...
            </>
          ) : (
            <><Zap size={14} /> Create Smart Deal</>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }`}</style>
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
  const [funding, setFunding] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [actionError, setActionError] = useState(null);

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

  const isClient     = currentUser && deal && deal.client_id     === currentUser.user_id;
  const isFreelancer = currentUser && deal && deal.freelancer_id  === currentUser.user_id;

  async function handleAccept() {
    setAccepting(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/accept`, { method: "POST" });
      await load();
    } catch (e) { setActionError(e.message); } finally { setAccepting(false); }
  }

  async function handleFund() {
    if (!window.confirm("Fund this deal? This will create an escrow for the agreed amount.")) return;
    setFunding(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/fund`, { method: "POST" });
      await load();
    } catch (e) { setActionError(e.message); } finally { setFunding(false); }
  }

  async function handleDeliver() {
    if (!window.confirm("Mark work as delivered? The client will have 48 hours to review.")) return;
    setDelivering(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/deliver`, { method: "POST" });
      await load();
    } catch (e) { setActionError(e.message); } finally { setDelivering(false); }
  }

  async function handleApprove() {
    if (!window.confirm("Approve this deliverable? This will release payment to the freelancer.")) return;
    setApproving(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/approve`, { method: "POST" });
      await load();
    } catch (e) { setActionError(e.message); } finally { setApproving(false); }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setDisputing(true); setActionError(null);
    try {
      await apiFetch(`/api/smart-deals/${dealId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason: disputeReason }),
      });
      setShowDisputeForm(false); await load();
    } catch (e) { setActionError(e.message); } finally { setDisputing(false); }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.page}>
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", color: "#7f1d1d", fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!deal) return null;

  const amountFormatted = `R ${Number(deal.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  return (
    <div style={S.page}>
      <Link to="/smart-deals" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={14} /> All deals
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", wordBreak: "break-word" }}>
            {deal.title}
          </h1>
          <StatusBadge status={deal.status} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>
            {amountFormatted}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {deal.currency}
          </div>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", color: "#7f1d1d", fontSize: 13, marginBottom: 14 }}>
          {actionError}
        </div>
      )}

      {/* Progress tracker */}
      <ProgressTracker status={deal.status} />

      {/* ── Action panels ── */}

      {/* Freelancer: accept */}
      {isFreelancer && deal.status === "PENDING" && (
        <div style={S.actionCard("#f97316", "#fff7ed")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color="#f97316" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Accept this deal</h3>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            Review the scope and amount below. Once you accept, the client can fund escrow and you can start work.
          </p>
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{ ...S.btn("#f97316"), opacity: accepting ? 0.6 : 1, cursor: accepting ? "not-allowed" : "pointer" }}
          >
            {accepting ? (
              <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Accepting...</>
            ) : (
              <>Accept deal <ArrowRight size={14} /></>
            )}
          </button>
        </div>
      )}

      {/* Client: fund escrow */}
      {isClient && deal.status === "ACCEPTED" && (
        <div style={S.actionCard("#3b82f6", "#eff6ff")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <DollarSign size={16} color="#3b82f6" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Fund escrow</h3>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            Your freelancer accepted the deal. Fund the escrow to let them start work. Funds are only released when you approve the delivery.
          </p>
          <button
            onClick={handleFund}
            disabled={funding}
            style={{ ...S.btn("#3b82f6"), opacity: funding ? 0.6 : 1, cursor: funding ? "not-allowed" : "pointer" }}
          >
            {funding ? (
              <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Funding...</>
            ) : (
              <><Shield size={14} /> Fund {amountFormatted}</>
            )}
          </button>
        </div>
      )}

      {/* Freelancer: mark as delivered */}
      {isFreelancer && deal.status === "FUNDED" && (
        <div style={S.actionCard("#8b5cf6", "#f5f3ff")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color="#8b5cf6" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Mark as delivered</h3>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            When your work is complete, mark it as delivered. The client has 48 hours to review and approve — if no action is taken, payment releases automatically.
          </p>
          <button
            onClick={handleDeliver}
            disabled={delivering}
            style={{ ...S.btn("#8b5cf6"), opacity: delivering ? 0.6 : 1, cursor: delivering ? "not-allowed" : "pointer" }}
          >
            {delivering ? (
              <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Submitting...</>
            ) : (
              <><CheckCircle size={14} /> Mark as delivered</>
            )}
          </button>
        </div>
      )}

      {/* Client: review & approve/dispute */}
      {isClient && deal.status === "DELIVERED" && (
        <div style={S.actionCard("#10b981", "#ecfdf5")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color="#10b981" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>Review the deliverable</h3>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
            Approve to release payment to the freelancer. Not happy with the work? Raise a dispute.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{ ...S.btn("#10b981"), flex: 1, minWidth: 160, opacity: approving ? 0.6 : 1, cursor: approving ? "not-allowed" : "pointer" }}
            >
              {approving ? (
                <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Releasing...</>
              ) : (
                <><CheckCircle size={14} /> Approve & release payment</>
              )}
            </button>
            <button
              onClick={() => setShowDisputeForm(v => !v)}
              style={{ ...S.btn("#ef4444"), minWidth: 100 }}
            >
              <AlertTriangle size={14} /> Dispute
            </button>
          </div>

          {showDisputeForm && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(16,185,129,0.2)" }}>
              <label style={{ ...S.label, marginBottom: 8 }}>Describe the issue</label>
              <textarea
                style={{ ...S.textarea, marginBottom: 10 }}
                placeholder="What's wrong with the deliverable? Be specific."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDispute}
                  disabled={disputing || !disputeReason.trim()}
                  style={{ ...S.btn("#ef4444"), opacity: (disputing || !disputeReason.trim()) ? 0.5 : 1, cursor: (disputing || !disputeReason.trim()) ? "not-allowed" : "pointer" }}
                >
                  {disputing ? "Submitting..." : "Submit dispute"}
                </button>
                <button
                  onClick={() => setShowDisputeForm(false)}
                  style={{ ...S.btn("transparent", "#64748b"), border: "1px solid #e2e8f0" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status waiting alerts */}
      {deal.status === "PENDING" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fde68a", borderLeft: "3px solid #f59e0b", marginBottom: 14 }}>
          <Clock size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}>Waiting for the freelancer to accept the deal.</p>
        </div>
      )}
      {deal.status === "ACCEPTED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "3px solid #3b82f6", marginBottom: 14 }}>
          <Clock size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#1e3a8a", margin: 0 }}>Waiting for the client to fund the escrow.</p>
        </div>
      )}
      {deal.status === "FUNDED" && isClient && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#f5f3ff", border: "1px solid #e9d5ff", borderLeft: "3px solid #8b5cf6", marginBottom: 14 }}>
          <Clock size={15} color="#7c3aed" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#4c1d95", margin: 0 }}>Escrow funded. Waiting for the freelancer to deliver the work.</p>
        </div>
      )}
      {deal.status === "DELIVERED" && isFreelancer && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", borderLeft: "3px solid #10b981", marginBottom: 14 }}>
          <Clock size={15} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#065f46", margin: 0 }}>Work delivered. Waiting for the client to review and approve. Auto-releases in 48 hours.</p>
        </div>
      )}
      {(deal.status === "COMPLETE" || deal.status === "APPROVED") && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", borderLeft: "3px solid #10b981", marginBottom: 14 }}>
          <CheckCircle size={15} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#065f46", margin: 0, fontWeight: 500 }}>Deal complete — payment has been released to the freelancer.</p>
        </div>
      )}
      {deal.dispute && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", marginBottom: 14 }}>
          <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, color: "#7f1d1d", margin: "0 0 3px", fontWeight: 600 }}>
              Dispute raised {new Date(deal.dispute.raised_at).toLocaleDateString("en-ZA")}
            </p>
            <p style={{ fontSize: 12, color: "#991b1b", margin: 0 }}>{deal.dispute.reason}</p>
          </div>
        </div>
      )}

      {/* Deal info card */}
      <div style={S.card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Deal Details
        </h3>
        <InfoRow label="Deal ID" value={deal.deal_id} mono />
        <InfoRow label="Client" value={deal.client_email} />
        <InfoRow label="Freelancer" value={deal.freelancer_email} />
        <InfoRow label="Amount" value={amountFormatted} mono />
        <InfoRow label="Days to deliver" value={`${deal.days_to_deliver} days`} />
        <InfoRow label="Fee paid by" value={deal.fee_paid_by === "FREELANCER" ? "Freelancer" : "Client"} />
        <InfoRow label="Created" value={new Date(deal.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />
        {deal.funded_at && <InfoRow label="Funded" value={new Date(deal.funded_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />}
        {deal.delivered_at && <InfoRow label="Delivered" value={new Date(deal.delivered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} />}

        {deal.description && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
              Scope
            </p>
            <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 }}>{deal.description}</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }`}</style>
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
      .then((r) => setDeals(r.deals))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Briefcase size={16} color="#fff" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Smart Deals</h1>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Escrow-protected digital work</p>
        </div>
        <button
          onClick={() => navigate("/smart-deals/new")}
          style={{ ...S.btn("#3b82f6"), gap: 6 }}
        >
          + New Deal
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
          <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && deals.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: "48px 32px" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#f8fafc", border: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Briefcase size={22} color="#94a3b8" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 6px" }}>No Smart Deals yet</h3>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Create an escrow deal for your freelance work.
          </p>
          <button
            onClick={() => navigate("/smart-deals/new")}
            style={S.btn("#3b82f6")}
          >
            <Zap size={14} /> Create your first Smart Deal
          </button>
        </div>
      )}

      {/* Deal list */}
      {!loading && deals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.map((d) => (
            <div
              key={d.deal_id}
              onClick={() => navigate(`/smart-deals/${d.deal_id}`)}
              style={{
                ...S.card,
                marginBottom: 0,
                cursor: "pointer",
                transition: "box-shadow 0.15s, transform 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(15,23,42,0.1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,0.06)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.title}
                  </p>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                    {d.client_email} → {d.freelancer_email}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 5px", fontFamily: "ui-monospace, monospace" }}>
                    R {Number(d.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                  </p>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default SmartDealDetail;
