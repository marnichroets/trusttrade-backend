import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";

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
  PENDING:   { label: "Awaiting payment",    color: "#854F0B", bg: "#FAEEDA" },
  FUNDED:    { label: "Funded — in progress", color: "#085041", bg: "#E1F5EE" },
  DELIVERED: { label: "Ready for review",    color: "#3C3489", bg: "#EEEDFE" },
  APPROVED:  { label: "Approved",            color: "#27500A", bg: "#EAF3DE" },
  COMPLETE:  { label: "Complete",            color: "#27500A", bg: "#EAF3DE" },
  DISPUTED:  { label: "In dispute",          color: "#712B13", bg: "#FAECE7" },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, color: "#5F5E5A", bg: "#F1EFE8" };
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "var(--color-background-primary,#fff)", border: "0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.12))", borderRadius: 12, padding: "1.25rem", ...style }}>
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style }) {
  const variants = {
    primary:   { background: "#1D9E75", color: "#fff", border: "none" },
    danger:    { background: "#D85A30", color: "#fff", border: "none" },
    secondary: { background: "transparent", color: "var(--color-text-primary)", border: "0.5px solid var(--color-border-secondary)" },
    ghost:     { background: "var(--color-background-secondary)", color: "var(--color-text-primary)", border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "opacity 0.15s", ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Input({ label, error, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>{label}</label>}
      <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${error ? "#D85A30" : "var(--color-border-secondary)"}`, fontSize: 14, background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} {...props} />
      {error && <p style={{ color: "#D85A30", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>{label}</label>}
      <textarea rows={4} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", fontSize: 14, background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} {...props} />
    </div>
  );
}

function Alert({ type = "info", children }) {
  const colors = { info: { bg: "#E6F1FB", border: "#378ADD", color: "#0C447C" }, success: { bg: "#EAF3DE", border: "#639922", color: "#27500A" }, warning: { bg: "#FAEEDA", border: "#BA7517", color: "#633806" }, error: { bg: "#FAECE7", border: "#D85A30", color: "#712B13" } };
  const c = colors[type];
  return <div style={{ padding: "12px 16px", borderRadius: 8, background: c.bg, borderLeft: `3px solid ${c.border}`, color: c.color, fontSize: 14, marginBottom: 16 }}>{children}</div>;
}

function ProgressTracker({ status }) {
  const steps = ["PENDING", "FUNDED", "DELIVERED", "COMPLETE"];
  const labels = { PENDING: "Created", FUNDED: "Funded", DELIVERED: "Delivered", COMPLETE: "Complete" };
  const current = status === "DISPUTED" ? "DELIVERED" : status;
  const currentIdx = steps.indexOf(current);
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 16, padding: "1rem 1.25rem", background: "var(--color-background-secondary)", borderRadius: 12 }}>
      {steps.map((step, i) => (
        <div key={step} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, background: i <= currentIdx ? "#1D9E75" : "var(--color-background-primary)", color: i <= currentIdx ? "#fff" : "var(--color-text-tertiary)", border: `1.5px solid ${i <= currentIdx ? "#1D9E75" : "var(--color-border-secondary)"}` }}>
              {i < currentIdx ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 11, color: i <= currentIdx ? "var(--color-text-primary)" : "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
              {labels[step]}
            </div>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: i < currentIdx ? "#1D9E75" : "var(--color-border-tertiary)", margin: "0 4px", marginBottom: 18 }} />}
        </div>
      ))}
    </div>
  );
}

export function CreateSmartDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", amount: "", freelancer_email: "", days_to_deliver: "", fee_paid_by: "CLIENT" });
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
      const res = await apiFetch("/api/smart-deals/", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), days_to_deliver: Number(form.days_to_deliver) }) });
      navigate(`/smart-deals/${res.deal_id}`);
    } catch (err) { setApiError(err.message); } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/smart-deals" style={{ fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none" }}>← Back</Link>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "1rem 0 0.25rem" }}>New Smart Deal</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>Funds held in escrow. Client approves the work to release payment to the freelancer.</p>
      {apiError && <Alert type="error">{apiError}</Alert>}
      <Card>
        <Input label="Deal title" placeholder="e.g. Logo design for Acme Co" value={form.title} onChange={set("title")} error={errors.title} />
        <Textarea label="Scope of work" placeholder="Describe exactly what will be delivered..." value={form.description} onChange={set("description")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Amount (ZAR)" type="number" placeholder="5000" value={form.amount} onChange={set("amount")} error={errors.amount} />
          <Input label="Days to deliver" type="number" placeholder="7" value={form.days_to_deliver} onChange={set("days_to_deliver")} error={errors.days_to_deliver} />
        </div>
        <Input label="Freelancer's email" type="email" placeholder="freelancer@example.com" value={form.freelancer_email} onChange={set("freelancer_email")} error={errors.freelancer_email} />
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>Who pays the TrustTrade fee?</label>
          <div style={{ display: "flex", gap: 12 }}>
            {["CLIENT", "FREELANCER"].map((v) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 }}>
                <input type="radio" value={v} checked={form.fee_paid_by === v} onChange={set("fee_paid_by")} />
                {v === "CLIENT" ? "I pay (client)" : "Freelancer pays"}
              </label>
            ))}
          </div>
        </div>
        <Alert type="info">Once created, your freelancer is notified. You fund escrow, they do the work, and you approve to release payment.</Alert>
        <Button onClick={handleSubmit} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>{loading ? "Creating..." : "Create Smart Deal"}</Button>
      </Card>
    </div>
  );
}

export function SmartDealDetail() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([apiFetch(`/api/smart-deals/${dealId}`), apiFetch("/api/auth/me")]);
      setDeal(d); setCurrentUser(u);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const isClient = currentUser && deal && deal.client_id === currentUser.user_id;

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
      await apiFetch(`/api/smart-deals/${dealId}/dispute`, { method: "POST", body: JSON.stringify({ reason: disputeReason }) });
      setShowDisputeForm(false); await load();
    } catch (e) { setActionError(e.message); } finally { setDisputing(false); }
  }

  if (loading) return <div style={{ padding: "2rem", color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</div>;
  if (error) return <div style={{ padding: "2rem" }}><Alert type="error">{error}</Alert></div>;
  if (!deal) return null;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/smart-deals" style={{ fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none" }}>← All deals</Link>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "1rem 0 1.5rem" }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 6px" }}>{deal.title}</h1><StatusBadge status={deal.status} /></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 500 }}>R {Number(deal.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{deal.currency}</div></div>
      </div>
      {actionError && <Alert type="error">{actionError}</Alert>}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem", fontSize: 14 }}>
          <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Client</div><div>{deal.client_email}</div></div>
          <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Freelancer</div><div>{deal.freelancer_email}</div></div>
          <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Days to deliver</div><div>{deal.days_to_deliver} days</div></div>
          <div><div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Created</div><div>{new Date(deal.created_at).toLocaleDateString("en-ZA")}</div></div>
        </div>
        {deal.description && <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{deal.description}</div>}
      </Card>
      <ProgressTracker status={deal.status} />
      {isClient && deal.status === "DELIVERED" && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, marginTop: 0, marginBottom: 8 }}>Review the deliverable</h3>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 0, marginBottom: 16 }}>Approve to release payment to the freelancer. Not happy? Raise a dispute.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={handleApprove} disabled={approving} style={{ flex: 1, justifyContent: "center" }}>{approving ? "Releasing payment..." : "Approve & release payment"}</Button>
            <Button variant="danger" onClick={() => setShowDisputeForm(true)} style={{ flex: 1, justifyContent: "center" }}>Dispute</Button>
          </div>
          {showDisputeForm && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <Textarea label="Describe the issue" placeholder="What's wrong with the deliverable?" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="danger" onClick={handleDispute} disabled={disputing || !disputeReason.trim()}>{disputing ? "Submitting..." : "Submit dispute"}</Button>
                <Button variant="secondary" onClick={() => setShowDisputeForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {deal.dispute && <Alert type="error">Dispute raised {new Date(deal.dispute.raised_at).toLocaleDateString("en-ZA")}: {deal.dispute.reason}</Alert>}
      {deal.status === "COMPLETE" && <Alert type="success">Deal complete — payment has been released to the freelancer.</Alert>}
    </div>
  );
}

export function SmartDealList() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => { apiFetch("/api/smart-deals/").then((r) => setDeals(r.deals)).catch(console.error).finally(() => setLoading(false)); }, []);
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Smart Deals</h1>
        <Button onClick={() => navigate("/smart-deals/new")}>+ New deal</Button>
      </div>
      {loading && <div style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</div>}
      {!loading && deals.length === 0 && <Card style={{ textAlign: "center", padding: "3rem" }}><div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>No Smart Deals yet.</div><Button onClick={() => navigate("/smart-deals/new")}>Create your first Smart Deal</Button></Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {deals.map((d) => (
          <Card key={d.deal_id} style={{ cursor: "pointer" }} onClick={() => navigate(`/smart-deals/${d.deal_id}`)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{d.client_email} → {d.freelancer_email}</div></div>
              <div style={{ textAlign: "right", marginLeft: 16, flexShrink: 0 }}><div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>R {Number(d.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</div><StatusBadge status={d.status} /></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default SmartDealDetail;