import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../utils/api';
import { toast } from 'sonner';
import { AlertCircle, Plus, X } from 'lucide-react';

function parseErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (!detail) return 'An error occurred';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  if (typeof detail === 'object') return detail.msg || detail.message || JSON.stringify(detail);
  return 'An error occurred';
}

const STATUS_COLOR = {
  Pending:  V.warn,
  Resolved: V.success,
  Rejected: V.error,
};

function SectionHead({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: V.sub,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: V.mono, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: V.border }} />
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: V.sub,
        fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Disputes() {
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    transaction_id: '',
    dispute_type: 'Other',
    description: '',
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (location.state?.transactionId) {
      setFormData(prev => ({ ...prev, transaction_id: location.state.transactionId }));
      setShowForm(true);
    }
  }, [location.state]);

  const fetchData = async () => {
    try {
      const [userRes, disputesRes, transactionsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/disputes'),
        api.get('/transactions'),
      ]);
      setUser(userRes.data);
      setDisputes(disputesRes.data);
      setTransactions(transactionsRes.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.transaction_id || !formData.description) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/disputes', formData);
      toast.success('Dispute raised successfully');
      setFormData({ transaction_id: '', dispute_type: 'Other', description: '' });
      setShowForm(false);
      fetchData();
    } catch (error) {
      toast.error(parseErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 4,
    border: `1px solid ${V.border}`, background: '#0D1117',
    color: V.text, fontFamily: V.sans, fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: 0 }}
                data-testid="disputes-title">
              Disputes
            </h1>
            <p style={{ color: V.sub, fontSize: 13, marginTop: 4, fontFamily: V.mono }}>
              {disputes.length} record{disputes.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            data-testid="raise-dispute-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: showForm ? V.dim : V.warn,
              color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 13,
              transition: 'opacity 0.15s',
            }}
          >
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Raise Dispute</>}
          </button>
        </div>

        {/* Raise Dispute Form */}
        {showForm && (
          <div style={{
            background: V.surface, border: `1px solid ${V.border}`,
            borderRadius: 4, padding: '20px 24px', marginBottom: 20,
          }}>
            <SectionHead label="New Dispute" />
            <form onSubmit={handleSubmit}>
              <Field label="Transaction *">
                <Select
                  value={formData.transaction_id}
                  onValueChange={v => setFormData(prev => ({ ...prev, transaction_id: v }))}
                >
                  <SelectTrigger
                    id="transaction_id"
                    data-testid="select-transaction"
                    style={{ ...inputStyle, height: 38 }}
                  >
                    <SelectValue placeholder="Select a transaction" />
                  </SelectTrigger>
                  <SelectContent>
                    {transactions.map(txn => (
                      <SelectItem key={txn.transaction_id} value={txn.transaction_id}>
                        {txn.transaction_id.substring(0, 12)}… — {txn.item_description.substring(0, 40)}{txn.item_description.length > 40 ? '…' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Dispute Type *">
                <Select
                  value={formData.dispute_type}
                  onValueChange={v => setFormData(prev => ({ ...prev, dispute_type: v }))}
                >
                  <SelectTrigger
                    id="dispute_type"
                    data-testid="select-dispute-type"
                    style={{ ...inputStyle, height: 38 }}
                  >
                    <SelectValue placeholder="Select dispute type" />
                  </SelectTrigger>
                  <SelectContent>
                    {['Item Not Received', 'Item Not As Described', 'Damaged Item', 'Payment Issue', 'Other'].map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Issue Description *">
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the issue with this transaction…"
                  rows={5}
                  required
                  data-testid="dispute-description-input"
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  data-testid="cancel-dispute-btn"
                  style={{
                    flex: 1, padding: '10px', borderRadius: 4,
                    border: `1px solid ${V.border}`, background: 'transparent',
                    color: V.text, fontFamily: V.sans, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="submit-dispute-btn"
                  style={{
                    flex: 1, padding: '10px', borderRadius: 4, border: 'none',
                    background: submitting ? V.dim : V.warn,
                    color: '#000', fontFamily: V.sans, fontWeight: 700, fontSize: 13,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit Dispute'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Disputes List */}
        <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4, padding: '20px 24px' }}>
          <SectionHead label="Your Disputes" />

          {disputes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <AlertCircle size={36} color={V.dim} style={{ margin: '0 auto 16px' }} />
              <p style={{ color: V.sub, fontSize: 14, marginBottom: 16 }}>No disputes raised yet</p>
              <button
                onClick={() => setShowForm(true)}
                data-testid="empty-state-raise-dispute"
                style={{
                  padding: '9px 18px', borderRadius: 4, border: `1px solid ${V.warn}`,
                  background: 'transparent', color: V.warn, cursor: 'pointer',
                  fontFamily: V.sans, fontSize: 13, fontWeight: 600,
                }}
              >
                Raise Your First Dispute
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {disputes.map(dispute => (
                <div
                  key={dispute.dispute_id}
                  data-testid={`dispute-${dispute.dispute_id}`}
                  style={{
                    background: '#0D1117', border: `1px solid ${V.border}`,
                    borderRadius: 4, padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 10, color: V.sub, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Dispute ID</p>
                      <p style={{ fontFamily: V.mono, fontSize: 12, color: V.text }}>{dispute.dispute_id}</p>
                    </div>
                    <span
                      data-testid={`dispute-status-${dispute.dispute_id}`}
                      style={{
                        padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                        fontFamily: V.mono,
                        color: STATUS_COLOR[dispute.status] || V.sub,
                        background: `${STATUS_COLOR[dispute.status] || V.sub}18`,
                        border: `1px solid ${STATUS_COLOR[dispute.status] || V.sub}40`,
                      }}
                    >
                      {dispute.status}
                    </span>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, color: V.sub, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Transaction ID</p>
                    <p style={{ fontFamily: V.mono, fontSize: 12, color: V.sub }}>{dispute.transaction_id}</p>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, color: V.sub, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Description</p>
                    <p style={{ fontSize: 13, color: V.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{dispute.description}</p>
                  </div>

                  <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono }}>
                    {new Date(dispute.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Disputes;
