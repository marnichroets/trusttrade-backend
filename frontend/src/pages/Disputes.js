import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertCircle, Plus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Disputes() {
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    transaction_id: '',
    description: ''
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Pre-select transaction if passed from transaction detail page
    if (location.state?.transactionId) {
      setFormData(prev => ({ ...prev, transaction_id: location.state.transactionId }));
      setShowForm(true);
    }
  }, [location.state]);

  const fetchData = async () => {
    try {
      const [userRes, disputesRes, transactionsRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/disputes`, { withCredentials: true }),
        axios.get(`${API}/transactions`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setDisputes(disputesRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.transaction_id || !formData.description) {
      toast.error('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(
        `${API}/disputes`,
        formData,
        { withCredentials: true }
      );

      toast.success('Dispute raised successfully');
      setFormData({ transaction_id: '', description: '' });
      setShowForm(false);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Failed to create dispute:', error);
      toast.error(error.response?.data?.detail || 'Failed to create dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Resolved': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  const getTransactionLabel = (txn) => {
    return `${txn.transaction_id.substring(0, 12)}... - ${txn.item_description.substring(0, 40)}${txn.item_description.length > 40 ? '...' : ''}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" data-testid="disputes-title">Disputes</h1>
            <p className="text-slate-600 mt-2">{disputes.length} dispute(s)</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            data-testid="raise-dispute-btn"
            className="hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 mr-2" />
            {showForm ? 'Cancel' : 'Raise Dispute'}
          </Button>
        </div>

        {/* Raise Dispute Form */}
        {showForm && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Raise a Dispute</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="transaction_id">Select Transaction *</Label>
                <Select
                  value={formData.transaction_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, transaction_id: value }))}
                >
                  <SelectTrigger id="transaction_id" data-testid="select-transaction">
                    <SelectValue placeholder="Select a transaction" />
                  </SelectTrigger>
                  <SelectContent>
                    {transactions.map((txn) => (
                      <SelectItem key={txn.transaction_id} value={txn.transaction_id}>
                        {getTransactionLabel(txn)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Issue Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the issue with this transaction..."
                  rows={5}
                  required
                  data-testid="dispute-description-input"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  data-testid="cancel-dispute-btn"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="submit-dispute-btn"
                  className="flex-1"
                >
                  {submitting ? 'Submitting...' : 'Submit Dispute'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Disputes List */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Your Disputes</h2>
          {disputes.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">No disputes raised yet</p>
              <Button
                onClick={() => setShowForm(true)}
                data-testid="empty-state-raise-dispute"
              >
                Raise Your First Dispute
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {disputes.map((dispute) => (
                <Card key={dispute.dispute_id} className="p-5 bg-slate-50 border-slate-200" data-testid={`dispute-${dispute.dispute_id}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Dispute ID</p>
                      <p className="font-mono text-sm text-slate-700">{dispute.dispute_id}</p>
                    </div>
                    <Badge className={getStatusBadge(dispute.status)} data-testid={`dispute-status-${dispute.dispute_id}`}>
                      {dispute.status}
                    </Badge>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-1">Transaction ID</p>
                    <p className="font-mono text-sm text-slate-700">{dispute.transaction_id}</p>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-1">Description</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispute.description}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Created on {new Date(dispute.created_at).toLocaleString()}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default Disputes;