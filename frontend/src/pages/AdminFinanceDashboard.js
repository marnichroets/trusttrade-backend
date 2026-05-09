import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileSearch,
  Landmark,
  RefreshCcw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import AdminNavbar, { Breadcrumbs } from '../components/AdminNavbar';

const STATE_META = {
  reconciled: { label: 'Reconciled', color: '#16a34a', bg: '#ecfdf5', text: '#166534' },
  pending_bank_settlement: { label: 'Pending bank settlement', color: '#ca8a04', bg: '#fefce8', text: '#854d0e' },
  token_residue: { label: 'Token residue', color: '#ea580c', bg: '#fff7ed', text: '#9a3412' },
  needs_tradesafe_support: { label: 'Needs TradeSafe support', color: '#dc2626', bg: '#fef2f2', text: '#991b1b' },
  missing_statement_entry: { label: 'Missing statement entry', color: '#64748b', bg: '#f8fafc', text: '#334155' },
};

const DEFAULT_STATE_META = { label: 'Unknown', color: '#64748b', bg: '#f8fafc', text: '#334155' };

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Not available';
  return `R${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(value) {
  if (!value) return 'Not available';
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rowState(row) {
  return row?.final_state || 'missing_statement_entry';
}

function stateMeta(state) {
  return STATE_META[state] || DEFAULT_STATE_META;
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
}

function groupByDay(entries, category) {
  const byDay = {};
  entries
    .filter((entry) => !category || entry.category === category)
    .forEach((entry) => {
      const day = String(entry.createdAt || '').slice(0, 10) || 'Unknown';
      byDay[day] = (byDay[day] || 0) + (Number(entry.amount_normalized) || 0);
    });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) }));
}

function groupCountsByDay(rows) {
  const byDay = {};
  rows.forEach((row) => {
    const firstEntry = row.statement_rows?.[0] || row.credit_rows?.[0] || row.withdrawal_rows?.[0];
    const day = String(firstEntry?.createdAt || '').slice(0, 10) || 'Unknown';
    byDay[day] = (byDay[day] || 0) + 1;
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function downloadCsv(filename, rows) {
  const columns = [
    'transaction_id',
    'deal_id',
    'seller_email',
    'expected_seller_amount',
    'tradesafe_transaction_id',
    'allocation_id',
    'statement_status',
    'payout_status',
    'settlement_status',
    'final_state',
    'seller_token',
  ];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((col) => escape(row[col] || (col === 'statement_status' ? statementStatus(row) : ''))).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function statementStatus(row) {
  const statuses = new Set((row.statement_rows || []).map((entry) => entry.status).filter(Boolean));
  if (statuses.size === 0) return 'No statement match';
  return Array.from(statuses).join(', ');
}

function fetchFinanceLedger() {
  return api.get('/admin/finance-ledger');
}

function fetchTokenStatement(tokenId) {
  return api.get(`/admin/token-statement/${tokenId}`);
}

function fetchFinanceMetrics() {
  return api.get('/admin/finance-metrics');
}

function fetchReconciliationStatus() {
  return api.get('/admin/finance-reconciliation-status');
}

function StatusPill({ state }) {
  const meta = stateMeta(state);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: meta.bg, color: meta.text }}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function MetricCard({ label, value, note, tone = 'slate', icon: Icon = CircleDollarSign }) {
  const tones = {
    slate: 'border-slate-200 bg-white',
    green: 'border-emerald-200 bg-emerald-50',
    yellow: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 h-56">{children}</div>
    </div>
  );
}

function StatementList({ title, rows }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {(rows || []).length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No matching rows.</p>
        ) : (
          rows.map((row, index) => (
            <div key={`${title}-${index}`} className="grid gap-2 border-b border-slate-100 p-3 text-sm last:border-b-0 md:grid-cols-[90px_90px_90px_1fr_140px]">
              <span className="font-semibold text-slate-800">{row.type}</span>
              <span>{money(row.amount_normalized)}</span>
              <span>{row.status || 'Unknown'}</span>
              <span className="break-words text-slate-600">{row.reference || 'No reference'}</span>
              <span className="text-slate-500">{formatDate(row.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DetailModal({ row, tokenStatement, onClose }) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finance drilldown</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{row.transaction_id || row.deal_id || 'Unknown transaction'}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill state={rowState(row)} />
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Token {shortId(row.seller_token)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Expected seller payout" value={money(row.expected_seller_amount)} />
            <MetricCard label="Statement status" value={statementStatus(row)} />
            <MetricCard label="Payout status" value={row.payout_status || 'Not available'} />
            <MetricCard label="Settlement status" value={row.settlement_status || 'Not available'} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Raw TradeSafe references</h3>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <p><span className="font-semibold">TradeSafe transaction:</span> {row.tradesafe_transaction_id || 'Not available'}</p>
              <p><span className="font-semibold">Allocation:</span> {row.allocation_id || 'Not available'}</p>
              <p><span className="font-semibold">Share code:</span> {row.share_code || 'Not available'}</p>
              <p><span className="font-semibold">Seller:</span> {row.seller_email || 'Not available'}</p>
            </div>
          </div>

          <StatementList title="Statement rows" rows={row.statement_rows} />
          <StatementList title="Allocation rows" rows={row.allocation_rows} />
          <StatementList title="Withdrawal rows" rows={row.withdrawal_rows} />
          <StatementList title="Fee rows" rows={row.fee_rows} />
          <StatementList title="Latest token statement rows" rows={tokenStatement?.statement?.entries || []} />
        </div>
      </div>
    </div>
  );
}

export default function AdminFinanceDashboard() {
  const { user, logout } = useAuth();
  const [ledger, setLedger] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [reconciliationStatus, setReconciliationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    negativeBalances: false,
    unresolvedOnly: false,
    token: '',
    seller: '',
  });
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedTokenStatement, setSelectedTokenStatement] = useState(null);

  async function loadLedger() {
    setLoading(true);
    setError('');
    try {
      const [ledgerRes, metricsRes, statusRes] = await Promise.all([
        fetchFinanceLedger(),
        fetchFinanceMetrics().catch(() => ({ data: null })),
        fetchReconciliationStatus().catch(() => ({ data: null })),
      ]);
      setLedger(ledgerRes.data);
      setMetrics(metricsRes.data);
      setReconciliationStatus(statusRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load finance ledger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLedger();
  }, []);

  useEffect(() => {
    if (!selectedRow?.seller_token) {
      setSelectedTokenStatement(null);
      return;
    }

    let cancelled = false;
    fetchTokenStatement(selectedRow.seller_token)
      .then((res) => {
        if (!cancelled) setSelectedTokenStatement(res.data);
      })
      .catch(() => {
        if (!cancelled) setSelectedTokenStatement(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRow]);

  const entries = useMemo(() => ledger?.recent_statement_entries || [], [ledger]);
  const tokens = useMemo(() => ledger?.tokens || [], [ledger]);
  const transactionRows = useMemo(() => ledger?.transaction_statement_matches || [], [ledger]);
  const summary = ledger?.summary || {};
  const orgAnalysis = ledger?.org_token_revenue_analysis || {};
  const activeAlerts = metrics?.active_alerts || reconciliationStatus?.active_alerts || [];

  const stateCounts = useMemo(() => {
    const counts = {
      reconciled: 0,
      pending_bank_settlement: 0,
      token_residue: 0,
      needs_tradesafe_support: 0,
      missing_statement_entry: 0,
    };
    transactionRows.forEach((row) => {
      const state = rowState(row);
      counts[state] = (counts[state] || 0) + 1;
    });
    return counts;
  }, [transactionRows]);

  const filteredRows = useMemo(() => {
    return transactionRows.filter((row) => {
      const statuses = (row.statement_rows || []).map((entry) => String(entry.status || '').toUpperCase());
      if (filters.status === 'PDNG' && !statuses.includes('PDNG')) return false;
      if (filters.status === 'ACSP' && !statuses.includes('ACSP')) return false;
      if (filters.unresolvedOnly && rowState(row) === 'reconciled') return false;
      if (filters.token && !String(row.seller_token || '').toLowerCase().includes(filters.token.toLowerCase())) return false;
      if (filters.seller && !String(row.seller_email || '').toLowerCase().includes(filters.seller.toLowerCase())) return false;
      return true;
    });
  }, [transactionRows, filters]);

  const visibleTokens = useMemo(() => {
    return tokens.filter((token) => {
      if (filters.negativeBalances && !(Number(token.balance) < 0)) return false;
      if (filters.token && !String(token.token_id || '').toLowerCase().includes(filters.token.toLowerCase())) return false;
      if (filters.seller && !String(token.email || '').toLowerCase().includes(filters.seller.toLowerCase())) return false;
      return true;
    });
  }, [tokens, filters]);

  const unresolvedCount = transactionRows.filter((row) => rowState(row) !== 'reconciled').length;
  const platformFeeTotal = Number(summary.trusttrade_agent_platform_fee_entries) || 0;
  const tradeSafeFees = Number(summary.tradesafe_fees) || 0;
  const negativeAdjustments = sumRows(tokens.filter((token) => Number(token.balance) < 0), 'balance');
  const netPlatformRevenue = platformFeeTotal - tradeSafeFees + negativeAdjustments;
  const orgTokenBalance = orgAnalysis.balance;
  const pendingSettlements = Number(summary.pdng_entries) || 0;

  const feeChart = groupByDay(entries, 'agent_fee');
  const withdrawalChart = groupByDay(entries, 'withdrawal_debit');
  const tradeSafeFeeChart = groupByDay(entries, 'tradesafe_fee');
  const unresolvedChart = groupCountsByDay(transactionRows.filter((row) => rowState(row) !== 'reconciled'));
  const orgMovementChart = groupByDay(entries.filter((entry) => entry.token_id === '32fbUbeMWjdor4uHBJdns'));
  const agingBuckets = useMemo(() => {
    const buckets = [
      { age: '< 24h', count: 0 },
      { age: '24-48h', count: 0 },
      { age: '> 48h', count: 0 },
    ];
    transactionRows
      .filter((row) => rowState(row) !== 'reconciled')
      .forEach((row) => {
        const age = Number(row.age_hours || 0);
        if (age >= 48) buckets[2].count += 1;
        else if (age >= 24) buckets[1].count += 1;
        else buckets[0].count += 1;
      });
    return buckets;
  }, [transactionRows]);

  const payoutAgingRows = useMemo(() => {
    return transactionRows
      .filter((row) => rowState(row) !== 'reconciled')
      .sort((a, b) => Number(b.age_hours || 0) - Number(a.age_hours || 0))
      .slice(0, 12);
  }, [transactionRows]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNavbar user={user} onLogout={logout} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: 'Finance' }]} />

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Internal finance operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Finance Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Read-only ledger view from TradeSafe tokenStatement evidence. No retries, withdrawals, or payout state changes run from this page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={loadLedger} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={() => downloadCsv('trusttrade-finance-ledger.csv', filteredRows)} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600">Loading finance ledger...</div>
        ) : (
          <>
            {activeAlerts.length > 0 && (
              <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <h2 className="font-bold text-amber-950">Live finance alerts</h2>
                    <div className="mt-2 grid gap-2">
                      {activeAlerts.slice(0, 5).map((alert, index) => (
                        <p key={alert.alert_id || index} className="text-sm text-amber-900">
                          <span className="font-semibold">{alert.severity || alert.priority || 'alert'}:</span> {alert.message}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950">Platform Revenue</h2>
                {Number(orgTokenBalance) < 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Org token negative
                  </span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
                <MetricCard label="TrustTrade fees earned" value={money(platformFeeTotal)} icon={Landmark} />
                <MetricCard label="TradeSafe fees" value={money(tradeSafeFees)} icon={CircleDollarSign} />
                <MetricCard label="Net platform revenue" value={money(netPlatformRevenue)} tone={netPlatformRevenue >= 0 ? 'green' : 'red'} icon={CircleDollarSign} />
                <MetricCard label="Negative fee adjustments" value={money(negativeAdjustments)} tone={negativeAdjustments < 0 ? 'red' : 'slate'} icon={AlertTriangle} />
                <MetricCard label="Org token balance" value={money(orgTokenBalance)} tone={Number(orgTokenBalance) < 0 ? 'red' : 'slate'} icon={Wallet} />
                <MetricCard label="Pending settlements" value={pendingSettlements} tone={pendingSettlements > 0 ? 'yellow' : 'green'} icon={FileSearch} />
                <MetricCard label="Unsettled transactions" value={unresolvedCount} tone={unresolvedCount > 0 ? 'yellow' : 'green'} icon={AlertTriangle} />
              </div>
            </section>

            <section className="mb-6 grid gap-3 md:grid-cols-4">
              <MetricCard
                label="Finance health score"
                value={metrics?.reconciliation_health_score ?? 'Not available'}
                tone={(metrics?.reconciliation_health_score ?? 0) >= 80 ? 'green' : (metrics?.reconciliation_health_score ?? 0) >= 60 ? 'yellow' : 'red'}
                note="Score reflects unresolved count, PDNG age, failed withdrawals, negative balances, and statement consistency."
                icon={CheckCircle2}
              />
              <MetricCard
                label="Last reconciliation"
                value={formatDate(metrics?.last_successful_reconciliation_at || reconciliationStatus?.last_successful_reconciliation_at)}
                note={reconciliationStatus?.daily_reconciliation_status || metrics?.daily_reconciliation_status || 'Status unknown'}
                icon={RefreshCcw}
              />
              <MetricCard
                label="Average payout time"
                value={metrics?.avg_payout_time === null || metrics?.avg_payout_time === undefined ? 'Not available' : `${metrics.avg_payout_time}h`}
                icon={Wallet}
              />
              <MetricCard
                label="Payout success rate"
                value={metrics?.payout_success_rate === null || metrics?.payout_success_rate === undefined ? 'Not available' : `${metrics.payout_success_rate}%`}
                tone={(metrics?.payout_success_rate ?? 100) >= 95 ? 'green' : 'yellow'}
                icon={CheckCircle2}
              />
            </section>

            <section className="mb-6 grid gap-3 lg:grid-cols-5">
              {Object.entries(stateCounts).map(([state, count]) => {
                const meta = stateMeta(state);
                return (
                  <div key={state} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <StatusPill state={state} />
                      <span className="text-2xl font-bold text-slate-950">{count}</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, count * 12)}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-950">Filters</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All statement statuses</option>
                  <option value="PDNG">PDNG only</option>
                  <option value="ACSP">ACSP only</option>
                </select>
                <input
                  value={filters.token}
                  onChange={(e) => setFilters((current) => ({ ...current, token: e.target.value }))}
                  placeholder="Specific token"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  value={filters.seller}
                  onChange={(e) => setFilters((current) => ({ ...current, seller: e.target.value }))}
                  placeholder="Specific seller"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.unresolvedOnly}
                    onChange={(e) => setFilters((current) => ({ ...current, unresolvedOnly: e.target.checked }))}
                  />
                  Unresolved transactions
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.negativeBalances}
                    onChange={(e) => setFilters((current) => ({ ...current, negativeBalances: e.target.checked }))}
                  />
                  Negative balances
                </label>
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <ChartPanel title="Fees Earned Over Time">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={feeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Area type="monotone" dataKey="amount" stroke="#0f172a" fill="#dbeafe" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Withdrawals Over Time">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={withdrawalChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="TradeSafe Fee Costs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tradeSafeFeeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Line type="monotone" dataKey="amount" stroke="#dc2626" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Unresolved Payout Counts">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unresolvedChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Unresolved By Age">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ca8a04" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="lg:col-span-2">
                <ChartPanel title="Org Token Movement">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={orgMovementChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => money(value)} />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {orgMovementChart.map((entry, index) => (
                          <Cell key={`org-${index}`} fill={entry.amount < 0 ? '#dc2626' : '#16a34a'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h2 className="text-lg font-bold text-slate-950">Payout Aging</h2>
                <p className="mt-1 text-sm text-slate-600">Oldest unresolved payouts by reconciliation age and SLA status.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Transaction</th>
                      <th className="px-4 py-3">Seller</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Age</th>
                      <th className="px-4 py-3">SLA</th>
                      <th className="px-4 py-3">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payoutAgingRows.map((row, index) => (
                      <tr key={`aging-${index}`}>
                        <td className="px-4 py-3 font-mono text-blue-700">{row.transaction_id || row.deal_id || 'Unknown'}</td>
                        <td className="px-4 py-3">{row.seller_email || 'Not available'}</td>
                        <td className="px-4 py-3">{money(row.expected_seller_amount)}</td>
                        <td className="px-4 py-3">{row.age_hours === null || row.age_hours === undefined ? 'Not available' : `${row.age_hours}h`}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.payout_sla_status === 'critical' ? 'bg-red-50 text-red-700' :
                            row.payout_sla_status === 'delayed' ? 'bg-amber-50 text-amber-700' :
                            'bg-emerald-50 text-emerald-700'
                          }`}>
                            {row.payout_sla_status || 'unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3"><StatusPill state={rowState(row)} /></td>
                      </tr>
                    ))}
                    {payoutAgingRows.length === 0 && (
                      <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-500">No unresolved payout aging rows.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h2 className="text-lg font-bold text-slate-950">Seller Wallet Monitoring</h2>
                <p className="mt-1 text-sm text-slate-600">Token balances, residues, statement status counts, and linked seller identity.</p>
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-3">
                {visibleTokens.map((token) => {
                  const analysis = token.analysis || {};
                  const pdngCount = analysis.summary?.statuses?.PDNG || 0;
                  const acspCount = analysis.summary?.statuses?.ACSP || 0;
                  return (
                    <div key={token.token_id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{token.email || token.name || 'Unknown seller'}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{token.token_id}</p>
                        </div>
                        {Number(token.balance) < 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Negative</span>}
                        {Number(token.balance) > 0 && <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">Review residue</span>}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-slate-500">Current balance</p><p className="font-bold text-slate-950">{money(token.balance)}</p></div>
                        <div><p className="text-slate-500">Residue balance</p><p className="font-bold text-slate-950">{money(analysis.residue_balance)}</p></div>
                        <div><p className="text-slate-500">PDNG entries</p><p className="font-bold text-slate-950">{pdngCount}</p></div>
                        <div><p className="text-slate-500">ACSP entries</p><p className="font-bold text-slate-950">{acspCount}</p></div>
                      </div>
                      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        <p><span className="font-semibold">Withdrawable status:</span> {analysis.safely_withdrawable ? 'Technically withdrawable, finance approval required' : 'Not cleared for withdrawal'}</p>
                        <p className="mt-1"><span className="font-semibold">Linked transactions:</span> {transactionRows.filter((row) => row.seller_token === token.token_id).length}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Transaction Finance Table</h2>
                  <p className="mt-1 text-sm text-slate-600">{filteredRows.length} visible rows from {transactionRows.length} ledger matches.</p>
                </div>
                <button onClick={() => downloadCsv('trusttrade-finance-filtered.csv', filteredRows)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <Download className="h-4 w-4" />
                  Export filtered CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Transaction ID</th>
                      <th className="px-4 py-3">Seller</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Expected payout</th>
                      <th className="px-4 py-3">TradeSafe reference</th>
                      <th className="px-4 py-3">Statement status</th>
                      <th className="px-4 py-3">Payout status</th>
                      <th className="px-4 py-3">Settlement status</th>
                      <th className="px-4 py-3">Final state</th>
                      <th className="px-4 py-3">Token ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row, index) => (
                      <tr key={`${row.transaction_id || row.deal_id}-${index}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedRow(row)} className="font-mono font-semibold text-blue-700 hover:underline">
                            {row.transaction_id || row.deal_id || 'Unknown'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.seller_email || 'Not available'}</td>
                        <td className="px-4 py-3">{money(row.expected_seller_amount)}</td>
                        <td className="px-4 py-3">{money(row.expected_seller_amount)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{shortId(row.tradesafe_transaction_id || row.allocation_id)}</td>
                        <td className="px-4 py-3">{statementStatus(row)}</td>
                        <td className="px-4 py-3">{row.payout_status || 'Not available'}</td>
                        <td className="px-4 py-3">{row.settlement_status || 'Not available'}</td>
                        <td className="px-4 py-3"><StatusPill state={rowState(row)} /></td>
                        <td className="px-4 py-3 font-mono text-xs">{shortId(row.seller_token)}</td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan="10" className="px-4 py-8 text-center text-slate-500">No finance rows match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Org Token Diagnostics</h2>
                  <p className="mt-1 text-sm text-slate-600">{orgAnalysis.negative_balance_explanation || 'No org token analysis returned.'}</p>
                </div>
                {Number(orgAnalysis.balance) < 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Fee setup review required
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    No negative org balance
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MetricCard label="Org token balance" value={money(orgAnalysis.balance)} tone={Number(orgAnalysis.balance) < 0 ? 'red' : 'slate'} />
                <MetricCard label="Platform fee totals" value={money(platformFeeTotal)} />
                <MetricCard label="Profitability view" value={netPlatformRevenue >= 0 ? 'Positive by ledger' : 'Needs review'} tone={netPlatformRevenue >= 0 ? 'green' : 'red'} note={orgAnalysis.trusttrade_fee_setup_assessment} />
              </div>
              <StatementList title="Current fee entries" rows={orgAnalysis.negative_entries || []} />
            </section>
          </>
        )}
      </main>
      <DetailModal row={selectedRow} tokenStatement={selectedTokenStatement} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
