import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Timeline from '../components/Timeline';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, FileText, User, Mail, Calendar, Package, Download, CheckCircle2, Image as ImageIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function TransactionDetail() {
  const [user, setUser] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sellerConfirming, setSellerConfirming] = useState(false);
  const navigate = useNavigate();
  const { transactionId } = useParams();

  useEffect(() => {
    fetchData();
  }, [transactionId]);

  const fetchData = async () => {
    try {
      const [userRes, transactionRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/transactions/${transactionId}`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setTransaction(transactionRes.data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
      toast.error('Transaction not found');
      navigate('/transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleSellerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details? This will generate the escrow agreement.')) {
      return;
    }

    setSellerConfirming(true);
    try {
      await axios.post(
        `${API}/transactions/${transactionId}/seller-confirm`,
        { confirmed: true },
        { withCredentials: true }
      );

      toast.success('Transaction confirmed! Escrow agreement generated.');
      fetchData();
    } catch (error) {
      console.error('Failed to confirm:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm transaction');
    } finally {
      setSellerConfirming(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!window.confirm('Are you sure you want to confirm delivery and release the funds to the seller?')) {
      return;
    }

    setConfirming(true);
    try {
      await axios.patch(
        `${API}/transactions/${transactionId}/delivery`,
        { delivery_confirmed: true },
        { withCredentials: true }
      );

      toast.success('Delivery confirmed and funds released!');
      fetchData();
    } catch (error) {
      console.error('Failed to confirm delivery:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await axios.get(
        `${API}/transactions/${transactionId}/agreement-pdf`,
        { withCredentials: true, responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TrustTrade_Agreement_${transactionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Agreement downloaded');
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Agreement not available yet');
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Pending Seller Confirmation': 'bg-orange-100 text-orange-800',
      'Pending Buyer Confirmation': 'bg-orange-100 text-orange-800',
      'Ready for Payment': 'bg-blue-100 text-blue-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  const getReleaseStatusBadge = (status) => {
    const variants = {
      'Not Released': 'bg-slate-100 text-slate-600',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!transaction) {
    return null;
  }

  const isBuyer = user?.user_id === transaction.buyer_user_id || user?.email === transaction.buyer_email;
  const isSeller = user?.user_id === transaction.seller_user_id || user?.email === transaction.seller_email;
  const canConfirmDelivery = isBuyer && !transaction.delivery_confirmed && transaction.payment_status !== 'Released';
  const canSellerConfirm = isSeller && !transaction.seller_confirmed;

  return (
    <DashboardLayout user={user}>
      <div className="max-w-6xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate('/transactions')} data-testid="back-to-transactions-btn">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Transactions
        </Button>

        <div>
          <h1 className="text-3xl font-bold text-slate-900">Transaction Details</h1>
          <p className="text-slate-600 mt-2 font-mono text-sm">{transaction.transaction_id}</p>
        </div>

        <Card className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-2">Payment Status</p>
              <Badge className={`${getStatusBadge(transaction.payment_status)} text-base px-3 py-1`}>
                {transaction.payment_status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-2">Release Status</p>
              <Badge className={`${getReleaseStatusBadge(transaction.release_status)} text-base px-3 py-1`}>
                {transaction.release_status}
              </Badge>
            </div>
          </div>
        </Card>

        {canSellerConfirm && (
          <Card className="p-6 bg-orange-50 border-orange-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Seller Confirmation Required</h3>
            <p className="text-sm text-slate-600 mb-4">
              Please review the transaction details carefully. Confirming will generate the escrow agreement and move the transaction forward.
            </p>
            <Button onClick={handleSellerConfirm} disabled={sellerConfirming} data-testid="seller-confirm-btn">
              {sellerConfirming ? 'Confirming...' : 'Confirm Transaction Details'}
            </Button>
          </Card>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agreement">Agreement</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />Buyer Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="text-sm font-medium text-slate-900">{transaction.buyer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Email</p>
                    <p className="text-sm text-slate-700">{transaction.buyer_email}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />Seller Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="text-sm font-medium text-slate-900">{transaction.seller_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Email</p>
                    <p className="text-sm text-slate-700">{transaction.seller_email}</p>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Details</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{transaction.item_description}</p>
                </div>
                {transaction.item_condition && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Condition</p>
                    <Badge className="bg-slate-100 text-slate-700">{transaction.item_condition}</Badge>
                  </div>
                )}
                {transaction.known_issues && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Known Issues</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{transaction.known_issues}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Price Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Item Price:</span>
                  <span className="font-mono font-medium text-slate-900">R {transaction.item_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">TrustTrade Fee (2%):</span>
                  <span className="font-mono font-medium text-slate-900">R {transaction.trusttrade_fee.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between">
                  <span className="font-semibold text-slate-900">Total Secure Payment:</span>
                  <span className="font-mono font-bold text-primary text-xl">R {transaction.total.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="agreement" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Escrow Agreement</h3>
              {transaction.seller_confirmed ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">The escrow agreement has been generated and is available for download.</p>
                  <Button onClick={handleDownloadPDF} data-testid="download-agreement-btn">
                    <Download className="w-4 h-4 mr-2" />Download Agreement (PDF)
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Agreement will be available once the seller confirms the transaction details.</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Transaction Progress</h3>
              <Timeline transaction={transaction} />
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Photos</h3>
              {transaction.item_photos && transaction.item_photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {transaction.item_photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <div className="w-full h-48 bg-slate-100 rounded-lg flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No photos uploaded</p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {canConfirmDelivery && (
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Confirm Delivery</h3>
            <p className="text-sm text-slate-600 mb-4">
              Have you received the item/service and are satisfied? Confirming delivery will release the funds to the seller.
            </p>
            <Button onClick={handleConfirmDelivery} disabled={confirming} data-testid="confirm-delivery-btn">
              {confirming ? 'Processing...' : 'Confirm Delivery & Release Funds'}
            </Button>
          </Card>
        )}

        {transaction.delivery_confirmed && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Delivery Confirmed</p>
                <p className="text-sm text-green-700">Funds have been released to the seller</p>
              </div>
            </div>
          </Card>
        )}

        {!transaction.delivery_confirmed && transaction.seller_confirmed && (
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Having issues with this transaction?</p>
            <Button variant="outline" onClick={() => navigate('/disputes', { state: { transactionId: transaction.transaction_id } })}>
              <FileText className="w-4 h-4 mr-2" />Raise a Dispute
            </Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default TransactionDetail;