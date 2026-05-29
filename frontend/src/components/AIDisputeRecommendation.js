/**
 * AI Dispute Recommendation — shared admin-facing components.
 *
 * Backend contract (dispute.ai_resolution):
 *   {
 *     recommended_decision: "Favour Buyer" | "Favour Seller",
 *     confidence: 0-100,
 *     reasoning: "2-3 sentences",
 *     missing_evidence: ["..."],
 *     resolution_path: "auto_resolve" | "ai_recommends" | "manual_review",
 *     model: "claude-sonnet-4-20250514",
 *     analyzed_at: ISO string
 *   }
 *
 * Admin actions hit: POST /admin/disputes/{id}/ai-decision  { action, decision?, notes }
 *
 * Uses the admin light theme (COLORS) + shadcn ui primitives so it drops into
 * AdminDisputes / AdminDisputeDetail without restyling.
 */
import { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import api from '../utils/api';
import { toast } from 'sonner';
import { Sparkles, CheckCircle, Edit3, Loader2, AlertTriangle, Scale } from 'lucide-react';

const COLORS = {
  primary: '#1a2942', green: '#2ecc71', background: '#ffffff', section: '#f8f9fa',
  text: '#212529', subtext: '#6c757d', border: '#dee2e6',
  error: '#e74c3c', warning: '#f39c12', info: '#3498db', purple: '#8e44ad',
};

export const PATH_META = {
  auto_resolve:  { label: 'Auto-Resolve',   color: COLORS.green,   hint: 'AI confidence > 90% — resolved automatically' },
  ai_recommends: { label: 'AI Recommended', color: COLORS.warning, hint: 'AI confidence 70–90% — admin approval required' },
  manual_review: { label: 'Manual Review',  color: COLORS.info,    hint: 'AI confidence < 70% — flagged for manual review' },
};

function confidenceColor(c) {
  if (c >= 90) return COLORS.green;
  if (c >= 70) return COLORS.warning;
  return COLORS.error;
}

/** Small inline confidence pill, e.g. "87% confident". */
export function ConfidenceBadge({ confidence }) {
  if (confidence == null) return <span style={{ color: COLORS.subtext, fontSize: 12 }}>—</span>;
  return (
    <Badge style={{ backgroundColor: confidenceColor(confidence), color: 'white' }}>
      {confidence}% confident
    </Badge>
  );
}

/** Resolution-path badge: Auto / AI Recommended / Manual. */
export function ResolutionPathBadge({ path }) {
  const meta = PATH_META[path];
  if (!meta) return null;
  return (
    <Badge style={{ backgroundColor: meta.color, color: 'white' }} title={meta.hint}>
      {meta.label}
    </Badge>
  );
}

/** Decision pill: Favour Buyer / Favour Seller. */
export function DecisionBadge({ decision }) {
  if (!decision) return null;
  const isBuyer = decision.toLowerCase().includes('buyer');
  return (
    <Badge style={{ backgroundColor: isBuyer ? COLORS.info : COLORS.green, color: 'white' }}>
      {decision}
    </Badge>
  );
}

/**
 * Full AI recommendation card with Approve / Override actions.
 * Props: dispute (with .ai_resolution), onResolved() callback to refetch.
 */
export function AIRecommendationCard({ dispute, onResolved }) {
  const ai = dispute?.ai_resolution;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const alreadyResolved = (dispute?.status || '').toLowerCase().includes('resolved');

  const act = async (action, decision) => {
    setBusy(true);
    try {
      await api.post(`/admin/disputes/${dispute.dispute_id}/ai-decision`, {
        action,
        decision: decision || undefined,
        notes,
      });
      toast.success(action === 'approve' ? 'AI decision approved' : 'Decision overridden');
      setOverrideOpen(false);
      onResolved && onResolved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!ai) {
    return (
      <div className="p-6 rounded-lg border" style={{ backgroundColor: COLORS.section, borderColor: COLORS.border }}>
        <div className="flex items-center gap-2 mb-2" style={{ color: COLORS.purple }}>
          <Sparkles className="w-5 h-5" />
          <h2 className="text-lg font-semibold">AI Recommendation</h2>
        </div>
        <p className="text-sm" style={{ color: COLORS.subtext }}>
          No AI analysis yet — it runs automatically when a dispute is opened.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-lg border" style={{ backgroundColor: COLORS.background, borderColor: COLORS.purple }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2" style={{ color: COLORS.purple }}>
          <Sparkles className="w-5 h-5" />
          <h2 className="text-lg font-semibold">AI Recommendation</h2>
        </div>
        <ResolutionPathBadge path={ai.resolution_path} />
      </div>

      {/* Decision + confidence */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4" style={{ color: COLORS.subtext }} />
          <DecisionBadge decision={ai.recommended_decision} />
        </div>
        <ConfidenceBadge confidence={ai.confidence} />
        {ai.model && (
          <span className="text-xs font-mono" style={{ color: COLORS.subtext }}>{ai.model}</span>
        )}
      </div>

      {/* Why flagged for admin review */}
      {ai.complex_case_reasons && ai.complex_case_reasons.length > 0 && (
        <div className="mb-4 p-3 rounded border" style={{ backgroundColor: '#fdf2f2', borderColor: COLORS.error }}>
          <p className="text-xs uppercase mb-1 font-medium flex items-center gap-1" style={{ color: COLORS.error }}>
            <AlertTriangle className="w-3 h-3" /> Flagged for admin review
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: COLORS.text }}>
            {ai.complex_case_reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {ai.admin_notified && (
            <p className="text-xs mt-2" style={{ color: COLORS.subtext }}>An alert was sent to the admin.</p>
          )}
        </div>
      )}

      {/* Reasoning */}
      {ai.reasoning && (
        <div className="mb-4">
          <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Reasoning</p>
          <p className="text-sm p-3 rounded" style={{ backgroundColor: COLORS.section, color: COLORS.text }}>
            {ai.reasoning}
          </p>
          {ai.forced_rule && (
            <p className="text-xs mt-1" style={{ color: COLORS.warning }}>
              A deterministic rule ({ai.forced_rule.replace(/_/g, ' ')}) set this decision regardless of the confidence score.
            </p>
          )}
        </div>
      )}

      {/* Evidence considered — every item the AI weighed and why */}
      {ai.evidence_considered && ai.evidence_considered.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Evidence considered</p>
          <div className="space-y-2">
            {ai.evidence_considered.map((e, i) => {
              const favours = (e.favours || 'neither').toLowerCase();
              const favColor = favours.includes('buyer') ? COLORS.info
                : favours.includes('seller') ? COLORS.green : COLORS.subtext;
              return (
                <div key={i} className="text-sm p-2 rounded" style={{ backgroundColor: COLORS.section }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge style={{ backgroundColor: favColor, color: 'white' }} className="text-xs">
                      {favours.includes('buyer') ? 'Buyer' : favours.includes('seller') ? 'Seller' : 'Neutral'}
                    </Badge>
                    <span className="font-medium" style={{ color: COLORS.text }}>{e.item}</span>
                  </div>
                  {e.why && <p style={{ color: COLORS.subtext }}>{e.why}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fraud indicators */}
      {ai.fraud_indicators && ai.fraud_indicators.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase mb-1 font-medium flex items-center gap-1" style={{ color: COLORS.error }}>
            <AlertTriangle className="w-3 h-3" /> Fraud indicators
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: COLORS.text }}>
            {ai.fraud_indicators.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {/* Missing evidence */}
      <div className="mb-4">
        <p className="text-xs uppercase mb-1 font-medium flex items-center gap-1" style={{ color: COLORS.subtext }}>
          <AlertTriangle className="w-3 h-3" /> Evidence that was missing
        </p>
        {ai.missing_evidence && ai.missing_evidence.length > 0 ? (
          <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: COLORS.text }}>
            {ai.missing_evidence.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: COLORS.subtext }}>None — evidence was sufficient.</p>
        )}
      </div>

      {/* Actions */}
      {alreadyResolved ? (
        <div className="flex items-center gap-2 text-sm p-3 rounded" style={{ backgroundColor: COLORS.section, color: COLORS.green }}>
          <CheckCircle className="w-4 h-4" /> This dispute is resolved.
        </div>
      ) : (
        <>
          <div className="mb-3">
            <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Resolution note (optional)</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note added to the resolution and emailed to both parties…"
              rows={2}
              style={{ borderColor: COLORS.border }}
            />
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => act('approve', ai.recommended_decision)}
              disabled={busy}
              className="flex-1 text-white justify-center"
              style={{ backgroundColor: COLORS.green }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Approve AI Decision
            </Button>
            <Button
              onClick={() => { setOverrideDecision(ai.recommended_decision?.toLowerCase().includes('buyer') ? 'Favour Seller' : 'Favour Buyer'); setOverrideOpen(true); }}
              disabled={busy}
              variant="outline"
              className="flex-1 justify-center"
              style={{ borderColor: COLORS.warning, color: COLORS.warning }}
            >
              <Edit3 className="w-4 h-4 mr-2" /> Override
            </Button>
          </div>
        </>
      )}

      {/* Override modal */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ color: COLORS.text }}>Override AI Decision</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm" style={{ color: COLORS.subtext }}>
              The AI recommended <strong>{ai.recommended_decision}</strong> at {ai.confidence}% confidence.
              Choose the decision to apply instead:
            </p>
            <div className="flex gap-2">
              {['Favour Buyer', 'Favour Seller'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setOverrideDecision(opt)}
                  className="flex-1 p-3 rounded border text-sm font-medium"
                  style={{
                    borderColor: overrideDecision === opt ? COLORS.primary : COLORS.border,
                    backgroundColor: overrideDecision === opt ? COLORS.section : COLORS.background,
                    color: COLORS.text,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for overriding (recommended)…"
              rows={3}
              style={{ borderColor: COLORS.border }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button
              onClick={() => act('override', overrideDecision)}
              disabled={busy || !overrideDecision}
              className="text-white"
              style={{ backgroundColor: COLORS.warning }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Apply: ${overrideDecision || '—'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AIRecommendationCard;
