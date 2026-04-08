import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
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
import ShareTransaction from './pages/ShareTransaction';
import UserProfile from './pages/UserProfile';
import LiveActivity from './pages/LiveActivity';
import IdentityVerification from './pages/IdentityVerification';
import PhoneVerification from './pages/PhoneVerification';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancelled from './pages/PaymentCancelled';
import BankingSettings from './pages/BankingSettings';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import EscrowPage from './pages/EscrowPage';
import DisputesPage from './pages/DisputesPage';
import RefundPage from './pages/RefundPage';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
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
      
      <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
      <Route path="/profile/:userId" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute><LiveActivity /></ProtectedRoute>} />
      <Route path="/verify" element={<ProtectedRoute><IdentityVerification /></ProtectedRoute>} />
      <Route path="/verify/phone" element={<ProtectedRoute><PhoneVerification /></ProtectedRoute>} />
      <Route path="/settings/banking" element={<ProtectedRoute><BankingSettings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
