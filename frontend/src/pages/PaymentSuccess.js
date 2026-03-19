import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, ArrowRight, Shield } from 'lucide-react';

function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Support both 'tx' (from TradeSafe redirect) and 'transaction_id'
  const transactionId = searchParams.get('tx') || searchParams.get('transaction_id');
  const reference = searchParams.get('reference');

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
        <p className="text-slate-600 mb-6">
          Your payment has been received and is now held securely in escrow.
        </p>

        {reference && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-500">Reference Number</p>
            <p className="font-mono font-medium text-slate-900">{reference}</p>
          </div>
        )}

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-emerald-700 mb-2">
            <Shield className="w-5 h-5" />
            <span className="font-semibold">Funds Secured</span>
          </div>
          <p className="text-sm text-emerald-600">
            Your payment is protected by TrustTrade Escrow. The seller will be notified to deliver your item.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            The seller has been notified and will now deliver the item. You will receive an email confirmation shortly.
          </p>
          
          {transactionId ? (
            <Button 
              onClick={() => navigate(`/transactions/${transactionId}`)} 
              className="w-full"
              data-testid="view-transaction-btn"
            >
              View Transaction
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={() => navigate('/transactions')} 
              className="w-full"
              data-testid="view-transactions-btn"
            >
              View My Transactions
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => navigate('/dashboard')} 
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Powered by TrustTrade Escrow Protection
        </p>
      </Card>
    </div>
  );
}

export default PaymentSuccess;
