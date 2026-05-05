import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import NewTransaction from './pages/NewTransaction';
import TransactionsList from './pages/TransactionsList';
import TransactionDetail from './pages/TransactionDetail';
import Disputes from './pages/Disputes';
import AdminDashboard from './pages/AdminDashboard';
import AdminTransactions from './pages/AdminTransactions';
import AdminUsers from './pages/AdminUsers';
import AdminDisputes from './pages/AdminDisputes';
import AdminTransactionDetail from './pages/AdminTransactionDetail';
import AdminDisputeDetail from './pages/AdminDisputeDetail';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminMonitoring from './pages/AdminMonitoring';
import AdminTokenRecovery from './pages/AdminTokenRecovery';
import ShareTransaction from './pages/ShareTransaction';
import UserProfile from './pages/UserProfile';
import LiveActivity from './pages/LiveActivity';
import IdentityVerification from './pages/IdentityVerification';
import PhoneVerification from './pages/PhoneVerification';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancelled from './pages/PaymentCancelled';
import BankingSettings from './pages/BankingSettings';
import { CreateSmartDeal, SmartDealDetail, SmartDealList } from './pages/SmartDeal';
import Onboarding from './pages/Onboarding';
import VerifyEmail from './pages/VerifyEmail';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import EscrowPage from './pages/EscrowPage';
import DisputesPage from './pages/DisputesPage';
import RefundPage from './pages/RefundPage';
import ResetPassword from './pages/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppRouter() {
  const location = useLocation();
  
  // CRITICAL: Check URL fragment for session_id synchronously (NOT in useEffect)
  // This prevents race conditions by processing OAuth callback FIRST
  if (location.hash?.includes('session_id=') || location.hash?.includes('session_token=')) {
    return <AuthCallback />;
  }
  
  return (
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
      <Route path="/t/:shareCode" element={<ShareTransaction />} />
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
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/monitoring" element={<ProtectedRoute><AdminMonitoring /></ProtectedRoute>} />
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
      <Route path="/smart-deals/:dealId" element={<ProtectedRoute><DashboardLayout user={null}><SmartDealDetail /></DashboardLayout></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
