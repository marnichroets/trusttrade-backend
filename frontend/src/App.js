import { Component, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import { PlatformConfigProvider } from './context/PlatformConfigContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import NewTransaction from './pages/NewTransaction';
import TransactionsList from './pages/TransactionsList';
import TransactionDetail from './pages/TransactionDetail';
import Disputes from './pages/Disputes';
import UserDisputeDetail from './pages/UserDisputeDetail';
import AdminDashboard from './pages/AdminDashboard';
import AdminTransactions from './pages/AdminTransactions';
import AdminUsers from './pages/AdminUsers';
import AdminDisputes from './pages/AdminDisputes';
import AdminTransactionDetail from './pages/AdminTransactionDetail';
import AdminDisputeDetail from './pages/AdminDisputeDetail';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminMonitoring from './pages/AdminMonitoring';
import AdminTokenRecovery from './pages/AdminTokenRecovery';
import AdminFinanceDashboard from './pages/AdminFinanceDashboard';
import ShareTransaction from './pages/ShareTransaction';
import ConfirmReceipt from './pages/ConfirmReceipt';
import UserProfile from './pages/UserProfile';
import LiveActivity from './pages/LiveActivity';
import IdentityVerification from './pages/IdentityVerification';
import PhoneVerification from './pages/PhoneVerification';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancelled from './pages/PaymentCancelled';
import BankingSettings from './pages/BankingSettings';
import { CreateSmartDeal, CreateMilestoneDeal, SmartDealDetail, SmartDealList } from './pages/SmartDeal';
import Onboarding from './pages/Onboarding';
import VerifyEmail from './pages/VerifyEmail';
import FAQPage from './pages/FAQPage';
import NotFoundPage from './pages/NotFoundPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import EscrowPage from './pages/EscrowPage';
import DisputesPage from './pages/DisputesPage';
import RefundPage from './pages/RefundPage';
import AboutPage from './pages/AboutPage';
import DemoPage from './pages/DemoPage';
import ResetPassword from './pages/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import { initMetaPixel, trackPageView } from './utils/analytics';
import './App.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: '#E6EDF3' }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1117', margin: 0 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#6E7681', margin: 0 }}>Please refresh the page. If the problem persists, contact support.</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2F81F4', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRouter() {
  const location = useLocation();

  useEffect(() => {
    initMetaPixel();
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  
  // CRITICAL: Check URL fragment for session_id synchronously (NOT in useEffect)
  // This prevents race conditions by processing OAuth callback FIRST
  if (location.hash?.includes('session_id=') || location.hash?.includes('session_token=')) {
    return <AuthCallback />;
  }

  return (
    <div key={location.pathname} className="page-fade-in">
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/escrow" element={<EscrowPage />} />
      <Route path="/disputes" element={<DisputesPage />} />
      <Route path="/refund" element={<RefundPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/t/:shareCode" element={<ShareTransaction />} />
      <Route path="/confirm/:token" element={<ConfirmReceipt />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-cancelled" element={<PaymentCancelled />} />
      <Route path="/transaction/success" element={<PaymentSuccess />} />
      <Route path="/transaction/failed" element={<PaymentCancelled />} />
      <Route path="/transaction/cancelled" element={<PaymentCancelled />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/transactions/new" element={<ProtectedRoute><NewTransaction /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><TransactionsList /></ProtectedRoute>} />
      <Route path="/transactions/:transactionId" element={<ProtectedRoute><TransactionDetail /></ProtectedRoute>} />
      <Route path="/disputes-dashboard" element={<ProtectedRoute><Disputes /></ProtectedRoute>} />
      <Route path="/dispute/:disputeId" element={<ProtectedRoute><UserDisputeDetail /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/monitoring" element={<ProtectedRoute><AdminMonitoring /></ProtectedRoute>} />
      <Route path="/admin/finance" element={<ProtectedRoute><AdminFinanceDashboard /></ProtectedRoute>} />
      <Route path="/admin/transactions" element={<ProtectedRoute><AdminTransactions /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/disputes" element={<ProtectedRoute><AdminDisputes /></ProtectedRoute>} />
      <Route path="/admin/transaction/:transactionId" element={<ProtectedRoute><AdminTransactionDetail /></ProtectedRoute>} />
      <Route path="/admin/dispute/:disputeId" element={<ProtectedRoute><AdminDisputeDetail /></ProtectedRoute>} />
      <Route path="/admin/user/:userId" element={<ProtectedRoute><AdminUserDetail /></ProtectedRoute>} />
      <Route path="/admin/token-recovery" element={<ProtectedRoute><AdminTokenRecovery /></ProtectedRoute>} />
      
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
      <Route path="/profile/:userId" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute><LiveActivity /></ProtectedRoute>} />
      <Route path="/verify" element={<ProtectedRoute><IdentityVerification /></ProtectedRoute>} />
      <Route path="/verify/phone" element={<ProtectedRoute><PhoneVerification /></ProtectedRoute>} />
      <Route path="/settings/banking" element={<ProtectedRoute><BankingSettings /></ProtectedRoute>} />
      <Route path="/smart-deals" element={<ProtectedRoute><DashboardLayout user={null}><SmartDealList /></DashboardLayout></ProtectedRoute>} />
      <Route path="/smart-deals/new" element={<ProtectedRoute><DashboardLayout user={null}><CreateSmartDeal /></DashboardLayout></ProtectedRoute>} />
      <Route path="/smart-deals/new-milestone" element={<ProtectedRoute><DashboardLayout user={null}><CreateMilestoneDeal /></DashboardLayout></ProtectedRoute>} />
      <Route path="/smart-deals/:dealId" element={<ProtectedRoute><DashboardLayout user={null}><SmartDealDetail /></DashboardLayout></ProtectedRoute>} />
      <Route path="/faq" element={<FAQPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <BrowserRouter>
          <PlatformConfigProvider>
            <AuthProvider>
              <AppRouter />
              <Toaster position="top-right" />
            </AuthProvider>
          </PlatformConfigProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}

export default App;
