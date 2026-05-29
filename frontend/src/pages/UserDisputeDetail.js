/**
 * UserDisputeDetail — party-facing dispute detail page (dark theme).
 *
 * Shows the user their dispute status, what evidence the AI found missing
 * (party-safe subset from POST /ai/dispute-advice — parties never see the
 * recommended decision/confidence while under review), and an Appeal button
 * if the party is still eligible (one appeal per party).
 *
 * Suggested route (wire in App.js):
 *   <Route path="/dispute/:disputeId" element={<ProtectedRoute><UserDisputeDetail /></ProtectedRoute>} />
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, ShieldQuestion, Gavel, Loader2, CheckCircle2 } from 'lucide-react';

const STATUS_COLOR = {
  Pending: V.warn,
  'Under Review': V.accent,
  Resolved: V.success,
  Appealed: V.warn,
  Rejected: V.error,
};

function statusColor(status) {
  return STATUS_COLOR[status] || V.sub;
}

function Label({ children }) {
  return (
    <p style={{
      fontSize: 10, color: V.sub, fontFamily: V.mono, textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: 6,
    }}>{children}</p>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4,
      padding: '20px 24px', marginBottom: 16, ...style,
    }}>{children}</div>
  );
}

function UserDisputeDetail() {
  const { disputeId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [advice, setAdvice] = useState(null);       // party-safe subset
  const [loading, setLoading] = useState(true);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealing, setAppealing] = useState(false);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [disputeId]);

  const fetchData = async () => {
    try {
      const [meRes, disputesRes, txnRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/disputes'),
        api.get('/transactions'),
      ]);
      setUser(meRes.data);

      const found = (disputesRes.data || []).find(d => d.dispute_id === disputeId);
      if (!found) {
        toast.error('Dispute not found');
        navigate('/disputes-dashboard');
        return;
      }
      setDispute(found);
      setTransaction((txnRes.data || []).find(t => t.transaction_id === found.transaction_id) || null);

      // Party-safe AI info (missing evidence + path). Best-effort.
      try {
        const adviceRes = await api.post('/ai/dispute-advice', { dispute_id: disputeId });
        setAdvice(adviceRes.data);
      } catch { /* AI not ready / unavailable — page still renders */ }
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const myRole = (() => {
    if (!transaction || !user) return null;
    const isBuyer = transaction.buyer_user_id === user.user_id ||
      (transaction.buyer_email || '').toLowerCase() === (user.email || '').toLowerCase();
    return isBuyer ? 'buyer' : 'seller';
  })();

  const alreadyAppealed = myRole === 'buyer' ? dispute?.buyer_appealed : dispute?.seller_appealed;
  const canAppeal = Boolean(myRole) && !alreadyAppealed;

  const submitAppeal = async () => {
    if (!appealReason.trim()) { toast.error('Please describe why you are appealing'); return; }
    setAppealing(true);
    try {
      await api.post(`/disputes/${disputeId}/appeal`, { reason: appealReason.trim() });
      toast.success('Appeal submitted — an admin will review it with the AI analysis.');
      setAppealOpen(false);
      setAppealReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not submit appeal');
    } finally {
      setAppealing(false);
    }
  };

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 0 40px' }}>
        <button
          onClick={() => navigate('/disputes-dashboard')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
            border: 'none', color: V.sub, cursor: 'pointer', fontSize: 13, marginBottom: 16,
            fontFamily: V.sans,
          }}
        >
          <ArrowLeft size={15} /> Back to disputes
        </button>

        {/* Header / status */}
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Label>Dispute</Label>
              <p style={{ fontFamily: V.mono, fontSize: 14, color: V.text }}>{dispute.dispute_id}</p>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 3, fontSize: 12, fontWeight: 600, fontFamily: V.mono,
              color: statusColor(dispute.status),
              background: `${statusColor(dispute.status)}18`,
              border: `1px solid ${statusColor(dispute.status)}40`,
            }}>
              {dispute.status}
            </span>
          </div>

          {transaction && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${V.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <Label>Item</Label>
                <p style={{ fontSize: 13, color: V.text }}>{transaction.item_description || '—'}</p>
              </div>
              <div>
                <Label>Amount</Label>
                <p style={{ fontSize: 13, color: V.text, fontFamily: V.mono }}>
                  R {Number(transaction.item_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <Label>Your role</Label>
                <p style={{ fontSize: 13, color: V.text, textTransform: 'capitalize' }}>{myRole || '—'}</p>
              </div>
              <div>
                <Label>Raised</Label>
                <p style={{ fontSize: 13, color: V.text }}>{new Date(dispute.created_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </Panel>

        {/* Resolution (when resolved) */}
        {dispute.resolution && (
          <Panel style={{ borderColor: `${V.success}55` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: V.success }}>
              <CheckCircle2 size={16} />
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Resolution
              </span>
            </div>
            <p style={{ fontSize: 13, color: V.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{dispute.resolution}</p>
            {dispute.resolved_at && (
              <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono, marginTop: 8 }}>
                {new Date(dispute.resolved_at).toLocaleString()}
              </p>
            )}
          </Panel>
        )}

        {/* What evidence is missing (party-safe AI subset) */}
        <Panel style={{ borderColor: `${V.accent}40`, background: `${V.accent}0A` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: V.accent }}>
            <ShieldQuestion size={16} />
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Strengthen your case
            </span>
          </div>
          {advice?.missing_evidence?.length > 0 ? (
            <>
              <p style={{ fontSize: 12, color: V.sub, marginBottom: 10 }}>
                Our AI review noted the following evidence would help resolve this dispute:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {advice.missing_evidence.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <AlertCircle size={14} color={V.warn} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: V.text }}>{m}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: V.sub }}>
              {advice ? 'No additional evidence was flagged as missing.' : 'AI review is still in progress — check back shortly.'}
            </p>
          )}
        </Panel>

        {/* Appeal */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: V.text }}>
            <Gavel size={16} color={V.sub} />
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.08em', color: V.sub }}>
              Appeal
            </span>
          </div>

          {alreadyAppealed ? (
            <p style={{ fontSize: 13, color: V.sub }}>
              You have already submitted your one appeal for this dispute. An admin will review it.
            </p>
          ) : !appealOpen ? (
            <>
              <p style={{ fontSize: 12, color: V.sub, marginBottom: 12 }}>
                Disagree with the outcome? You may appeal once. Your appeal goes to an admin together with the full AI analysis.
              </p>
              <button
                onClick={() => setAppealOpen(true)}
                disabled={!canAppeal}
                style={{
                  padding: '9px 18px', borderRadius: 4, border: `1px solid ${V.warn}`,
                  background: 'transparent', color: V.warn, cursor: canAppeal ? 'pointer' : 'not-allowed',
                  fontFamily: V.sans, fontSize: 13, fontWeight: 600, opacity: canAppeal ? 1 : 0.5,
                }}
              >
                Appeal this dispute
              </button>
            </>
          ) : (
            <div>
              <Label>Why are you appealing?</Label>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                rows={4}
                placeholder="Explain what you believe was missed or got wrong…"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 4, border: `1px solid ${V.border}`,
                  background: '#0D1117', color: V.text, fontFamily: V.sans, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={submitAppeal}
                  disabled={appealing}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 4, border: 'none',
                    background: appealing ? V.dim : V.warn, color: '#000',
                    fontFamily: V.sans, fontWeight: 700, fontSize: 13,
                    cursor: appealing ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {appealing ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit Appeal'}
                </button>
                <button
                  onClick={() => { setAppealOpen(false); setAppealReason(''); }}
                  style={{
                    padding: '10px 18px', borderRadius: 4, border: `1px solid ${V.border}`,
                    background: 'transparent', color: V.sub, cursor: 'pointer',
                    fontFamily: V.sans, fontSize: 13,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </DashboardLayout>
  );
}

export default UserDisputeDetail;
