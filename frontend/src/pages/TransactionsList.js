import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import { Plus, FileText, Search } from 'lucide-react';

function fmt(value) {
  const n = Number(value);
  if (value === null || value === undefined || isNaN(n)) return 'R0.00';
  return `R${n.toFixed(2)}`;
}

const STATUS_COLOR = {
  Pending:      V.warn,
  Paid:         V.success,
  Released:     V.success,
  Cancelled:    V.error,
  Refunded:     V.sub,
  'Not Released': V.sub,
};

function SectionHead({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
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

function TransactionsList() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { filterTransactions(); }, [transactions, searchTerm]);

  const fetchData = async () => {
    try {
      const [userRes, transactionsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/transactions'),
      ]);
      setUser(userRes.data);
      setTransactions(transactionsRes.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    if (!searchTerm) { setFilteredTransactions(transactions); return; }
    const term = searchTerm.toLowerCase();
    setFilteredTransactions(transactions.filter(t =>
      t.buyer_name.toLowerCase().includes(term) ||
      t.seller_name.toLowerCase().includes(term) ||
      t.item_description.toLowerCase().includes(term) ||
      t.transaction_id.toLowerCase().includes(term)
    ));
  };

  if (loading) {
    return (
      <DashboardLayout user={null} loading>
        <div />
      </DashboardLayout>
    );
  }

  const cell = {
    padding: '14px 12px',
    borderBottom: `1px solid ${V.border}`,
    fontSize: 13,
    color: V.text,
    verticalAlign: 'middle',
  };

  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 700, color: V.text, margin: 0 }}
                data-testid="transactions-list-title">
              My Transactions
            </h1>
            <p style={{ color: V.sub, fontSize: 13, marginTop: 4, fontFamily: V.mono }}>
              {filteredTransactions.length} record{filteredTransactions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/transactions/new')}
            data-testid="new-transaction-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: V.accent, color: '#000', fontFamily: V.sans,
              fontWeight: 700, fontSize: 13,
              boxShadow: `0 0 12px ${V.accent}40`,
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 20px ${V.accent}80`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = `0 0 12px ${V.accent}40`}
          >
            <Plus size={15} /> New Transaction
          </button>
        </div>

        {/* Search */}
        <div style={{
          background: V.surface, border: `1px solid ${V.border}`,
          borderRadius: 4, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        }}>
          <Search size={15} color={V.sub} />
          <input
            type="text"
            placeholder="Search by buyer, seller, description, or transaction ID…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            data-testid="search-transactions-input"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: V.text, fontFamily: V.sans, fontSize: 13,
            }}
          />
        </div>

        {/* Table */}
        <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4 }}>
          <div style={{ padding: '16px 20px 0' }}>
            <SectionHead label="Transaction Records" />
          </div>

          {filteredTransactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <FileText size={36} color={V.dim} style={{ margin: '0 auto 16px' }} />
              <p style={{ color: V.sub, fontSize: 14, marginBottom: 16 }}>
                {searchTerm ? 'No transactions match your search' : 'No transactions yet'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => navigate('/transactions/new')}
                  data-testid="empty-state-create-transaction"
                  style={{
                    padding: '9px 18px', borderRadius: 4, border: `1px solid ${V.accent}`,
                    background: 'transparent', color: V.accent, cursor: 'pointer',
                    fontFamily: V.sans, fontSize: 13, fontWeight: 600,
                  }}
                >
                  Create Your First Transaction
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['TX ID', 'Buyer', 'Seller', 'Item', 'Price', 'Fee', 'Total', 'Payment', 'Release', 'Date'].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: 10, fontWeight: 700, color: V.sub,
                        fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em',
                        borderBottom: `1px solid ${V.border}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(t => (
                    <tr
                      key={t.transaction_id}
                      onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                      data-testid={`transaction-row-${t.transaction_id}`}
                      style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = `${V.accent}08`}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...cell, fontFamily: V.mono, fontSize: 11, color: V.sub }}>
                        {t.transaction_id.substring(0, 12)}…
                      </td>
                      <td style={cell}>{t.buyer_name}</td>
                      <td style={cell}>{t.seller_name}</td>
                      <td style={{ ...cell, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={t.item_description}>
                        {t.item_description}
                      </td>
                      <td style={{ ...cell, fontFamily: V.mono }}>{fmt(t.item_price)}</td>
                      <td style={{ ...cell, fontFamily: V.mono, color: V.sub }}>{fmt(t.trusttrade_fee)}</td>
                      <td style={{ ...cell, fontFamily: V.mono, fontWeight: 700, color: V.text }}>{fmt(t.total)}</td>
                      <td style={cell}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                          fontFamily: V.mono,
                          color: STATUS_COLOR[t.payment_status] || V.warn,
                          background: `${STATUS_COLOR[t.payment_status] || V.warn}18`,
                          border: `1px solid ${STATUS_COLOR[t.payment_status] || V.warn}40`,
                        }}>
                          {t.payment_status}
                        </span>
                      </td>
                      <td style={cell}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                          fontFamily: V.mono,
                          color: STATUS_COLOR[t.release_status] || V.sub,
                          background: `${STATUS_COLOR[t.release_status] || V.sub}18`,
                          border: `1px solid ${STATUS_COLOR[t.release_status] || V.sub}40`,
                        }}>
                          {t.release_status}
                        </span>
                      </td>
                      <td style={{ ...cell, color: V.sub, fontFamily: V.mono, fontSize: 11 }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default TransactionsList;
