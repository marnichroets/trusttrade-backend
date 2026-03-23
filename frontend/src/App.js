import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import LandingPage from './pages/LandingPage';
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
import TermsAndConditions from './pages/TermsAndConditions';
import ShareTransaction from './pages/ShareTransaction';
import UserProfile from './pages/UserProfile';
import LiveActivity from './pages/LiveActivity';
import IdentityVerification from './pages/IdentityVerification';
import PhoneVerification from './pages/PhoneVerification';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancelled from './pages/PaymentCancelled';
import BankingSettings from './pages/BankingSettings';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppRouter() {
  const location = useLocation();
  
  // CRITICAL: Check URL fragment synchronously during render to prevent race conditions
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/terms" element={<TermsAndConditions />} />
      <Route path="/t/:shareCode" element={<ShareTransaction />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-cancelled" element={<PaymentCancelled />} />
      {/* Payment redirect URLs */}
      <Route path="/transaction/success" element={<PaymentSuccess />} />
      <Route path="/transaction/failed" element={<PaymentCancelled />} />
      <Route path="/transaction/cancelled" element={<PaymentCancelled />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/transactions/new" element={<ProtectedRoute><NewTransaction /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><TransactionsList /></ProtectedRoute>} />
      <Route path="/transactions/:transactionId" element={<ProtectedRoute><TransactionDetail /></ProtectedRoute>} />
      <Route path="/disputes" element={<ProtectedRoute><Disputes /></ProtectedRoute>} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
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
        <AppRouter />
        <Toaster position="top-right" />
      </BrowserRouter>
    </div>
  );
}

export default App;
