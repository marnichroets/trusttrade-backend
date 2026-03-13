import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { XCircle, ArrowRight, RefreshCw } from 'lucide-react';

function PaymentCancelled() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const transactionId = searchParams.get('transaction_id');
  const reason = searchParams.get('reason');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-12 h-12 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Cancelled</h1>
        <p className="text-slate-600 mb-6">
          {reason === 'failed' 
            ? 'Your payment could not be processed. Please try again or use a different payment method.'
            : 'Your payment was cancelled. No funds have been deducted from your account.'}
        </p>

        <div className="space-y-3">
          {transactionId ? (
            <>
              <Button 
                onClick={() => navigate(`/transactions/${transactionId}`)} 
                className="w-full"
                data-testid="retry-payment-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate(`/transactions/${transactionId}`)} 
                className="w-full"
              >
                View Transaction
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          ) : (
            <Button 
              onClick={() => navigate('/transactions')} 
              className="w-full"
            >
              View My Transactions
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          
          <Button 
            variant="ghost" 
            onClick={() => navigate('/dashboard')} 
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600">
            Need help? Contact our support team if you're experiencing issues with payments.
          </p>
        </div>

        <p className="text-xs text-slate-400 mt-4">
          Powered by TrustTrade Escrow
        </p>
      </Card>
    </div>
  );
}

export default PaymentCancelled;
