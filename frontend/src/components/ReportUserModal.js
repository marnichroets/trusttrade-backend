import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertTriangle, Flag, X } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'sonner';

const REPORT_REASONS = [
  { value: 'scam_attempt', label: 'Scam Attempt' },
  { value: 'abuse_harassment', label: 'Abuse or Harassment' },
  { value: 'suspicious_behavior', label: 'Suspicious Behavior' },
  { value: 'fake_account', label: 'Fake Account' },
  { value: 'non_delivery', label: 'Non-Delivery of Item' },
  { value: 'misrepresentation', label: 'Item Misrepresentation' },
  { value: 'other', label: 'Other' }
];

function ReportUserModal({ isOpen, onClose, reportedUserId, reportedUserName, transactionId = null }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }

    if (!description.trim()) {
      toast.error('Please provide a description');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(
        '/reports',
        {
          reported_user_id: reportedUserId,
          reason,
          description: description.trim(),
          transaction_id: transactionId
        }
      );

      toast.success('Report submitted successfully. Our team will review it.');
      onClose();
      setReason('');
      setDescription('');
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Flag className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Report User</h2>
            <p className="text-sm text-slate-500">Report {reportedUserName}</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
          <div className="flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              False reports may result in action against your account. Only submit genuine concerns.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reason">Reason for Report *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason" data-testid="report-reason-select">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Please provide details about your concern..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              data-testid="report-description"
            />
            <p className="text-xs text-slate-500 mt-1">
              Include specific details, dates, and any evidence you have.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={submitting}
              className="flex-1 bg-red-600 hover:bg-red-700"
              data-testid="submit-report-btn"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportUserModal;
