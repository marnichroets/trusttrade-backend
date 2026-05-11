import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock,
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

function groupProfitByDay(rows, key = 'net_platform_profit') {
  const byDay = {};
  rows.forEach((row) => {
    const day = String(row.created_at || '').slice(0, 10) || 'Unknown';
    byDay[day] = (byDay[day] || 0) + (Number(row[key]) || 0);
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) }));
}

function marginBySize(rows) {
  const buckets = [
    { size: '< R250', min: 0, max: 250 },
    { size: 'R250-R500', min: 250, max: 500 },
    { size: 'R500-R1k', min: 500, max: 1000 },
    { size: 'R1k-R5k', min: 1000, max: 5000 },
    { size: '> R5k', min: 5000, max: Infinity },
  ];
  return buckets.map((bucket) => {
    const rowsInBucket = rows.filter((row) => {
      const gross = Number(row.gross_transaction_amount || 0);
      return gross >= bucket.min && gross < bucket.max;
    });
    const avg = rowsInBucket.length
      ? rowsInBucket.reduce((sum, row) => sum + (Number(row.profit_margin_percent) || 0), 0) / rowsInBucket.length
      : 0;
    return { size: bucket.size, margin: Number(avg.toFixed(2)), count: rowsInBucket.length };
  });
}

function downloadCsv(filename, rows) {
  const columns = [
    'transaction_id',
    'deal_id',
    'seller_email',
    'expected_seller_amount',
    'gross_transaction_amount',
    'trusttrade_fee_earned',
    'tradesafe_fees',
    'net_platform_profit',
    'profit_margin_percent',
    'profitable',
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
    ...rows.map((row) => columns.map((col) => escape(row[col] ?? row.profitability?.[col] ?? (col === 'statement_status' ? statementStatus(row) : ''))).join(',')),
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

function fetchProfitability() {
  return api.get('/admin/profitability');
}

function fetchPayoutReadiness() {
  return api.get('/admin/payout-readiness');
}

function fetchPayoutSettlementMonitor() {
  return api.get('/admin/payout-settlement-monitor');
}

function downloadPendingBankSettlementCsv(rows) {
  const columns = [
    ['transaction id', 'transaction_id'],
    ['TradeSafe transaction id', 'tradesafe_transaction_id'],
    ['seller token', 'seller_token'],
    ['amount', 'amount'],
    ['released_at', 'released_at'],
    ['processed_at', 'processed_at'],
    ['status', 'status'],
    ['age', 'age'],
    ['recommended action', 'recommended_action'],
  ];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.map(([label]) => label).join(','),
    ...rows.map((row) => columns.map(([, key]) => escape(row[key])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pending-bank-settlement-report.csv';
  link.click();
  URL.revokeObjectURL(url);
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
          {row.profitability && (
            <div className="grid gap-3 md:grid-cols-5">
              <MetricCard label="Gross amount" value={money(row.profitability.gross_transaction_amount)} />
              <MetricCard label="TT fee" value={money(row.profitability.trusttrade_fee_earned)} />
              <MetricCard label="TradeSafe costs" value={money(row.profitability.total_costs)} />
              <MetricCard label="Net profit" value={money(row.profitability.net_platform_profit)} tone={row.profitability.net_platform_profit >= 0 ? 'green' : 'red'} />
              <MetricCard label="Recommendation" value={row.profitability.recommendation || 'N/A'} tone={row.profitability.profitable ? 'green' : 'red'} />
            </div>
          )}

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
  const [profitability, setProfitability] = useState(null);
  const [payoutReadiness, setPayoutReadiness] = useState(null);
  const [payoutSettlementMonitor, setPayoutSettlementMonitor] = useState(null);
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
      const [ledgerRes, metricsRes, statusRes, profitabilityRes, payoutReadinessRes, payoutSettlementRes] = await Promise.all([
        fetchFinanceLedger(),
        fetchFinanceMetrics().catch(() => ({ data: null })),
        fetchReconciliationStatus().catch(() => ({ data: null })),
        fetchProfitability().catch(() => ({ data: null })),
        fetchPayoutReadiness().catch(() => ({ data: null })),
        fetchPayoutSettlementMonitor().catch(() => ({ data: null })),
      ]);
      setLedger(ledgerRes.data);
      setMetrics(metricsRes.data);
      setReconciliationStatus(statusRes.data);
      setProfitability(profitabilityRes.data);
      setPayoutReadiness(payoutReadinessRes.data);
      setPayoutSettlementMonitor(payoutSettlementRes.data);
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
  const settlementSummary = payoutSettlementMonitor?.summary || {};
  const pendingBankSettlementRows = payoutSettlementMonitor?.pending_bank_settlement_rows || [];
  const profitabilityRows = useMemo(() => profitability?.transactions || [], [profitability]);
  const profitabilityById = useMemo(() => {
    const byId = {};
    profitabilityRows.forEach((row) => {
      if (row.transaction_id) byId[row.transaction_id] = row;
      if (row.deal_id) byId[row.deal_id] = row;
    });
    return byId;
  }, [profitabilityRows]);

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
    return transactionRows.map((row) => ({
      ...row,
      profitability: profitabilityById[row.transaction_id] || profitabilityById[row.deal_id] || null,
    })).filter((row) => {
      const statuses = (row.statement_rows || []).map((entry) => String(entry.status || '').toUpperCase());
      if (filters.status === 'PDNG' && !statuses.includes('PDNG')) return false;
      if (filters.status === 'ACSP' && !statuses.includes('ACSP')) return false;
      if (filters.unresolvedOnly && rowState(row) === 'reconciled') return false;
      if (filters.token && !String(row.seller_token || '').toLowerCase().includes(filters.token.toLowerCase())) return false;
      if (filters.seller && !String(row.seller_email || '').toLowerCase().includes(filters.seller.toLowerCase())) return false;
      return true;
    });
  }, [transactionRows, filters, profitabilityById]);

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
  const negativeAdjustments = 0;
  const feeSetupReviewTotal = Number(summary.fee_setup_review_entries) || 0;
  const netPlatformRevenue = platformFeeTotal - tradeSafeFees + negativeAdjustments;
  const orgTokenBalance = orgAnalysis.balance;
  const lastOrgMovementTimestamp = orgAnalysis.last_new_org_token_movement_timestamp || metrics?.last_new_org_token_movement_timestamp;
  const pendingSettlements = Number(summary.pdng_entries) || 0;

  const feeChart = groupByDay(entries, 'agent_fee');
  const withdrawalChart = groupByDay(entries, 'withdrawal_debit');
  const tradeSafeFeeChart = groupByDay(entries, 'tradesafe_fee');
  const unresolvedChart = groupCountsByDay(transactionRows.filter((row) => rowState(row) !== 'reconciled'));
  const orgMovementChart = groupByDay(entries.filter((entry) => entry.token_id === '32fbUbeMWjdor4uHBJdns'));
  const profitChart = groupProfitByDay(profitabilityRows, 'net_platform_profit');
  const profitabilityFeeChart = groupProfitByDay(profitabilityRows, 'tradesafe_fees');
  const marginSizeChart = marginBySize(profitabilityRows);
  const profitableSplit = [
    { name: 'Profitable', value: profitability?.profitable_transaction_count || 0 },
    { name: 'Loss-making', value: profitability?.loss_making_transaction_count || 0 },
  ];
  const segmentChart = (profitability?.transaction_segments || []).map((segment) => ({
    segment: segment.segment,
    profit: segment.net_profit || 0,
    margin: segment.margin_percent || 0,
    lossCount: segment.loss_making_count || 0,
  }));
  const recommendedModel = profitability?.recommendation_engine?.recommended_model || 'Not available';
  const riskyModels = (profitability?.fee_strategy_presets || []).filter((model) => (model.projected_margin_percent ?? 0) < 10);
  const payoutSlaCounts = {
    processingToday: metrics?.payouts_processing_today ?? 0,
    nextBusinessDay: metrics?.payouts_expected_next_business_day ?? 0,
    approachingTwoDays: metrics?.payouts_approaching_2_business_days ?? 0,
    critical: metrics?.critical_delayed_payouts ?? 0,
    monitor: metrics?.payout_monitor_count ?? 0,
  };
  const payoutSettlementCounts = {
    released: settlementSummary.released_payouts ?? 0,
    processingStarted: settlementSummary.payout_processing_started ?? 0,
    tradesafeProcessedRows: settlementSummary.tradesafe_processed_rows ?? 0,
    bankNotConfirmed: settlementSummary.bank_settlement_not_confirmed ?? 0,
    pending: settlementSummary.bank_settlement_pending ?? metrics?.bank_settlement_pending_count ?? 0,
    delayed: settlementSummary.delayed ?? 0,
    critical: settlementSummary.critical ?? 0,
  };
  const readinessRows = payoutReadiness?.rows || [];
  const readinessIssues = readinessRows.filter((row) => !row.ready_for_fast_payout).slice(0, 6);
  const testChecklist = [
    'Create test transaction',
    'Confirm payment',
    'Confirm delivery',
    'Verify payout',
    'Verify reconciliation',
    'Verify settlement',
    'Verify profitability',
  ];
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
            {payoutSettlementCounts.pending > 0 && (
              <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div className="flex-1">
                    <h2 className="font-bold text-amber-950">Payout processed by TradeSafe, bank settlement pending</h2>
                    <p className="mt-1 text-sm text-amber-900">
                      {payoutSettlementCounts.pending} payout{payoutSettlementCounts.pending === 1 ? '' : 's'} show TradeSafe processed evidence without local bank confirmation.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-amber-950">
                      Do not retry if TradeSafe already shows processed payout entry.
                    </p>
                  </div>
                  <button onClick={() => downloadPendingBankSettlementCsv(pendingBankSettlementRows)} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                    <Download className="h-4 w-4" />
                    Pending Bank Settlement Report
                  </button>
                </div>
              </section>
            )}

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
                <MetricCard label="Fee setup review" value={money(feeSetupReviewTotal)} tone={feeSetupReviewTotal < 0 ? 'yellow' : 'slate'} icon={AlertTriangle} />
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

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Payout SLA Monitoring</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Payouts are processed as quickly as possible and may take up to 2 business days. Alerts monitor released payouts after 6h, flag delayed after 24h, and mark critical after 48 business hours.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <Clock className="h-3.5 w-3.5" />
                  Same-day target · next-business-day target · 2 business day maximum messaging
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MetricCard label="Processing today" value={payoutSlaCounts.processingToday} tone="green" icon={Wallet} />
                <MetricCard label="Expected next business day" value={payoutSlaCounts.nextBusinessDay} tone={payoutSlaCounts.nextBusinessDay > 0 ? 'yellow' : 'slate'} icon={Clock} />
                <MetricCard label="Monitor after 6h" value={payoutSlaCounts.monitor} tone={payoutSlaCounts.monitor > 0 ? 'yellow' : 'green'} icon={FileSearch} />
                <MetricCard label="Approaching 2 business days" value={payoutSlaCounts.approachingTwoDays} tone={payoutSlaCounts.approachingTwoDays > 0 ? 'yellow' : 'green'} icon={AlertTriangle} />
                <MetricCard label="Critical delayed payouts" value={payoutSlaCounts.critical} tone={payoutSlaCounts.critical > 0 ? 'red' : 'green'} icon={ShieldAlert} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4 lg:grid-cols-7">
                <MetricCard label="Released payouts" value={payoutSettlementCounts.released} icon={Wallet} />
                <MetricCard label="Processing started" value={payoutSettlementCounts.processingStarted} icon={Clock} />
                <MetricCard label="TradeSafe processed rows" value={payoutSettlementCounts.tradesafeProcessedRows} tone={payoutSettlementCounts.tradesafeProcessedRows > 0 ? 'yellow' : 'slate'} icon={FileSearch} />
                <MetricCard label="Bank not confirmed" value={payoutSettlementCounts.bankNotConfirmed} tone={payoutSettlementCounts.bankNotConfirmed > 0 ? 'yellow' : 'green'} icon={AlertTriangle} />
                <MetricCard label="Settlement pending" value={payoutSettlementCounts.pending} tone={payoutSettlementCounts.pending > 0 ? 'yellow' : 'green'} icon={Landmark} />
                <MetricCard label="Delayed" value={payoutSettlementCounts.delayed} tone={payoutSettlementCounts.delayed > 0 ? 'yellow' : 'green'} icon={Clock} />
                <MetricCard label="Critical" value={payoutSettlementCounts.critical} tone={payoutSettlementCounts.critical > 0 ? 'red' : 'green'} icon={ShieldAlert} />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-600">
                Internal note: Do not retry if TradeSafe already shows processed payout entry. This monitor is read-only and does not run withdrawals or payout mutations.
              </p>
              {readinessIssues.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-950">Seller payout readiness issues</p>
                  <div className="mt-2 grid gap-2">
                    {readinessIssues.map((row) => (
                      <div key={row.seller_token_id} className="grid gap-2 text-sm text-amber-900 md:grid-cols-[1fr_150px_2fr]">
                        <span className="font-semibold">{row.seller_email || row.seller_token_id}</span>
                        <span>{row.payout_interval || 'No interval'}</span>
                        <span>{(row.issues || []).join(', ') || 'Review required'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950">Unit Economics</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {profitability?.basis || 'Profitability data unavailable'}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                <MetricCard label="Total revenue" value={money(profitability?.total_revenue)} icon={Landmark} />
                <MetricCard label="TradeSafe costs" value={money(profitability?.total_tradesafe_costs)} icon={CircleDollarSign} />
                <MetricCard label="Net profit" value={money(profitability?.total_net_profit)} tone={(profitability?.total_net_profit ?? 0) >= 0 ? 'green' : 'red'} />
                <MetricCard label="Avg profit / txn" value={money(profitability?.average_profit_per_transaction)} />
                <MetricCard label="Profit margin" value={profitability?.profit_margin_percent === null || profitability?.profit_margin_percent === undefined ? 'Not available' : `${profitability.profit_margin_percent}%`} />
                <MetricCard label="Loss-making txns" value={profitability?.loss_making_transaction_count ?? 'Not available'} tone={(profitability?.loss_making_transaction_count || 0) > 0 ? 'red' : 'green'} />
              </div>
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
              <ChartPanel title="Profit Over Time">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profitChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Area type="monotone" dataKey="amount" stroke="#16a34a" fill="#dcfce7" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Profitability Fees Over Time">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitabilityFeeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Line type="monotone" dataKey="amount" stroke="#dc2626" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Margin By Transaction Size">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marginSizeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="size" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="margin" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Profitable vs Loss-making">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitableSplit}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {profitableSplit.map((entry, index) => (
                        <Cell key={`profit-split-${index}`} fill={entry.name === 'Profitable' ? '#16a34a' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Profitability By Segment">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={segmentChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                      {segmentChart.map((entry, index) => (
                        <Cell key={`segment-${index}`} fill={entry.profit >= 0 ? '#16a34a' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
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
              <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Pending Bank Settlement Report</h2>
                  <p className="mt-1 text-sm text-slate-600">TradeSafe processed payout entries with no local bank settlement confirmation.</p>
                </div>
                <button onClick={() => downloadPendingBankSettlementCsv(pendingBankSettlementRows)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <Download className="h-4 w-4" />
                  Export report
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Transaction ID</th>
                      <th className="px-4 py-3">TradeSafe transaction ID</th>
                      <th className="px-4 py-3">Seller token</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Released</th>
                      <th className="px-4 py-3">Processed</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Age</th>
                      <th className="px-4 py-3">Recommended action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingBankSettlementRows.map((row, index) => (
                      <tr key={`pending-bank-${row.transaction_id || index}`}>
                        <td className="px-4 py-3 font-mono text-blue-700">{row.transaction_id || 'Unknown'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{shortId(row.tradesafe_transaction_id)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{shortId(row.seller_token)}</td>
                        <td className="px-4 py-3">{money(row.amount)}</td>
                        <td className="px-4 py-3">{formatDate(row.released_at)}</td>
                        <td className="px-4 py-3">{formatDate(row.processed_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === 'critical' ? 'bg-red-50 text-red-700' :
                            row.status === 'delayed' ? 'bg-amber-50 text-amber-700' :
                            'bg-emerald-50 text-emerald-700'
                          }`}>
                            {row.status || 'on_track'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.age || 'Not available'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.recommended_action || 'Review bank settlement evidence'}</td>
                      </tr>
                    ))}
                    {pendingBankSettlementRows.length === 0 && (
                      <tr><td colSpan="9" className="px-4 py-6 text-center text-slate-500">No payouts are currently marked Bank settlement pending.</td></tr>
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

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Fee Simulation</h2>
                <p className="mt-1 text-sm text-slate-600">Live simulation comparison for fee strategy presets and projected monthly economics.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[920px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2">Revenue</th>
                        <th className="px-3 py-2">Profit</th>
                        <th className="px-3 py-2">Margin</th>
                        <th className="px-3 py-2">Monthly profit</th>
                        <th className="px-3 py-2">Payout costs</th>
                        <th className="px-3 py-2">Loss rate</th>
                        <th className="px-3 py-2">Loss txns</th>
                        <th className="px-3 py-2">Warning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(profitability?.fee_strategy_presets || profitability?.fee_simulations || []).map((model, index) => (
                        <tr key={`sim-${index}`}>
                          <td className="px-3 py-2 font-semibold">{model.label || `${model.percent}% / min ${money(model.minimum_fee)}`}</td>
                          <td className="px-3 py-2">{money(model.projected_revenue)}</td>
                          <td className={`px-3 py-2 font-semibold ${(model.projected_profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{money(model.projected_profit)}</td>
                          <td className="px-3 py-2">{model.projected_margin_percent ?? 'N/A'}%</td>
                          <td className="px-3 py-2">{money(model.estimated_monthly_profit)}</td>
                          <td className="px-3 py-2">{money(model.estimated_payout_costs)}</td>
                          <td className="px-3 py-2">{model.estimated_loss_rate ?? 0}%</td>
                          <td className="px-3 py-2">{model.loss_making_transaction_count}</td>
                          <td className="px-3 py-2">
                            {model.pricing_warning ? (
                              <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">pricing model risky</span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">acceptable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Pricing Analysis</h2>
                <p className="mt-1 text-sm text-slate-600">Break-even fee percentage by payment rail and transaction size.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {Object.entries(profitability?.pricing_analysis?.by_payment_method || {}).map(([method, rows]) => (
                    <div key={method} className="rounded-lg border border-slate-200 p-3">
                      <h3 className="text-sm font-bold uppercase text-slate-700">{method}</h3>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {rows.slice(0, 4).map((row) => (
                          <p key={`${method}-${row.transaction_size}`}>
                            R{row.transaction_size}: <span className="font-semibold text-slate-900">{row.break_even_fee_percent}%</span> break-even
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {(profitability?.recommendations || []).map((item, index) => (
                    <p key={`rec-${index}`} className="mb-1 last:mb-0">{item}</p>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Recommendation Engine</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p><span className="font-semibold">Recommended model:</span> {recommendedModel}</p>
                  <p><span className="font-semibold">Minimum fee:</span> {money(profitability?.recommendation_engine?.recommended_minimum_fee)}</p>
                  <p><span className="font-semibold">Safer fee %:</span> {profitability?.recommendation_engine?.recommended_fee_percent ?? 'N/A'}%</p>
                  <p><span className="font-semibold">Surcharge methods:</span> {(profitability?.recommendation_engine?.surcharge_payment_methods || []).join(', ') || 'None flagged'}</p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Operational Recommendations</h2>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  {(profitability?.recommendation_engine?.operational_recommendations || profitability?.recommendations || []).slice(0, 6).map((item, index) => (
                    <p key={`op-rec-${index}`}>{item}</p>
                  ))}
                  {riskyModels.length > 0 && <p className="font-semibold text-red-700">Some projected models are below 10% margin: pricing model risky.</p>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Production Test Checklist</h2>
                <div className="mt-4 space-y-2">
                  {testChecklist.map((item, index) => (
                    <label key={item} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="rounded border-slate-300" />
                      <span>{index + 1}. {item}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Transaction Segmentation</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {(profitability?.transaction_segments || []).map((segment) => (
                  <div key={segment.segment} className={`rounded-lg border p-3 ${segment.loss_making ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <p className="text-sm font-bold text-slate-950">{segment.segment}</p>
                    <p className="mt-2 text-xs text-slate-600">Transactions: {segment.transaction_count}</p>
                    <p className="text-xs text-slate-600">Net profit: {money(segment.net_profit)}</p>
                    <p className="text-xs text-slate-600">Margin: {segment.margin_percent ?? 'N/A'}%</p>
                    {segment.loss_making && <p className="mt-2 text-xs font-semibold text-red-700">loss-making segment</p>}
                  </div>
                ))}
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
                <table className="min-w-[1580px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Transaction ID</th>
                      <th className="px-4 py-3">Seller</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Gross amount</th>
                      <th className="px-4 py-3">TT fee</th>
                      <th className="px-4 py-3">TS fees</th>
                      <th className="px-4 py-3">Net profit</th>
                      <th className="px-4 py-3">Margin</th>
                      <th className="px-4 py-3">Profitable</th>
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
                        <td className="px-4 py-3">{money(row.profitability?.gross_transaction_amount)}</td>
                        <td className="px-4 py-3">{money(row.profitability?.trusttrade_fee_earned)}</td>
                        <td className="px-4 py-3">{money(row.profitability?.tradesafe_fees)}</td>
                        <td className={`px-4 py-3 font-semibold ${(row.profitability?.net_platform_profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {money(row.profitability?.net_platform_profit)}
                        </td>
                        <td className="px-4 py-3">{row.profitability?.profit_margin_percent ?? 'N/A'}%</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.profitability?.profitable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {row.profitability?.profitable ? 'Yes' : row.profitability ? 'No · fee too low' : 'N/A'}
                          </span>
                        </td>
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
                        <td colSpan="16" className="px-4 py-8 text-center text-slate-500">No finance rows match the current filters.</td>
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
                  <p className="mt-1 text-sm text-slate-600">Org token balance reflects TradeSafe statement accounting and may include historical fee movements.</p>
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
                <MetricCard label="Last new org-token movement" value={formatDate(lastOrgMovementTimestamp)} />
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
