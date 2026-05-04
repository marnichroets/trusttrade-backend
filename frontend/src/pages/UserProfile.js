import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import ReportUserModal from '../components/ReportUserModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import api from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, Star, Shield, ShieldCheck, Award, CheckCircle, AlertTriangle, TrendingUp, Package, User as UserIcon, Flag, HelpCircle } from 'lucide-react';

function SectionHead({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: V.sub,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: V.mono, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: V.border }} />
    </div>
  );
}

const TRUST_COLOR = (score) => {
  if (score >= 80) return V.success;
  if (score >= 60) return V.accent;
  if (score >= 40) return V.warn;
  return V.error;
};

const BADGE_CONFIG = {
  Verified: { color: V.accent,   icon: ShieldCheck },
  Gold:     { color: '#F0B429',  icon: Award },
  Silver:   { color: '#A0AEC0',  icon: Award },
};

function BadgePill({ badge }) {
  const cfg = BADGE_CONFIG[badge] || { color: V.sub, icon: Shield };
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 3,
      fontSize: 11, fontWeight: 600, fontFamily: V.mono,
      color: cfg.color,
      background: `${cfg.color}18`,
      border: `1px solid ${cfg.color}40`,
    }}>
      <Icon size={11} /> {badge} Trust Badge
    </span>
  );
}

function StarRating({ value }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={14}
          style={{
            fill: star <= value ? '#F0B429' : star - 0.5 <= value ? '#F0B42980' : 'transparent',
            color: star <= value ? '#F0B429' : star - 0.5 <= value ? '#F0B429' : V.dim,
          }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  return (
    <div style={{ height: 4, background: V.border, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2,
        background: color,
        width: `${Math.min(100, (value / max) * 100)}%`,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function UserProfile() {
  const [user, setUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const navigate = useNavigate();
  const { userId } = useParams();

  useEffect(() => { fetchData(); }, [userId]);

  const fetchData = async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      const targetUserId = userId || userRes.data.user_id;
      const profileRes = await api.get(`/users/${targetUserId}/profile`);
      setProfileUser(profileRes.data);
    } catch {
      toast.error('Profile not found');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardLayout user={null} loading><div /></DashboardLayout>;
  }

  if (!profileUser) return null;

  const isSelf = user?.user_id === profileUser.user_id;
  const tc = TRUST_COLOR(profileUser.trust_score);

  const surface = { background: V.surface, border: `1px solid ${V.border}`, borderRadius: 4, padding: '20px 24px' };

  const scoreBreakdown = [
    {
      label: 'Transaction History',
      tooltip: 'Earn 4 points for each successful trade completed. Maximum 40 points (10 trades).',
      score: Math.min(40, (profileUser.successful_trades || 0) * 4),
      max: 40,
      color: V.accent,
    },
    {
      label: 'User Ratings',
      tooltip: 'Based on average star rating from other users. 6 points per star, maximum 30 points.',
      score: Math.round((profileUser.average_rating || 0) * 6),
      max: 30,
      color: '#F0B429',
    },
    {
      label: 'Dispute Record',
      tooltip: 'Starts at 20 points, minus 5 for each valid dispute. A clean record means no confirmed complaints.',
      score: Math.max(0, 20 - (profileUser.valid_disputes_count || 0) * 5),
      max: 20,
      color: V.success,
    },
    {
      label: 'Verification Status',
      tooltip: '10 bonus points for completing identity verification (ID, selfie, phone number).',
      score: profileUser.verified ? 10 : 0,
      max: 10,
      color: '#A78BFA',
    },
  ];

  return (
    <DashboardLayout user={user}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <button onClick={() => navigate(-1)} data-testid="back-btn" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: V.sub, cursor: 'pointer',
          fontFamily: V.sans, fontSize: 13, marginBottom: 20,
        }}>
          <ArrowLeft size={14} /> Back
        </button>

        {/* Profile Header */}
        <div style={{ ...surface, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>

            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              {profileUser.picture ? (
                <img
                  src={profileUser.picture}
                  alt={profileUser.name}
                  style={{ width: 80, height: 80, borderRadius: '50%', border: `2px solid ${V.border}`, objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: `${V.accent}18`, border: `2px solid ${V.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <UserIcon size={36} color={V.accent} />
                </div>
              )}
              {profileUser.verified && (
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  background: V.accent, borderRadius: '50%', padding: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckCircle size={12} color="#000" />
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontFamily: V.sans, fontSize: 20, fontWeight: 700, color: V.text, margin: 0 }}>
                  {profileUser.name}
                </h1>
                {profileUser.suspended && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                    color: V.error, background: `${V.error}18`, border: `1px solid ${V.error}40`,
                    fontFamily: V.mono,
                  }}>
                    Suspended
                  </span>
                )}
              </div>
              <p style={{ color: V.sub, fontSize: 13, marginBottom: 10 }}>{profileUser.email}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profileUser.badges?.length > 0
                  ? profileUser.badges.map((b, i) => <BadgePill key={i} badge={b} />)
                  : <span style={{ color: V.dim, fontSize: 12 }}>No badges yet</span>
                }
              </div>
            </div>

            {/* Trust Score */}
            <div style={{
              textAlign: 'center', minWidth: 120,
              background: `${tc}0F`, border: `1px solid ${tc}30`,
              borderRadius: 4, padding: '16px 24px',
            }}>
              <p style={{ fontSize: 10, color: V.sub, fontFamily: V.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Trust Score
              </p>
              <p style={{ fontFamily: V.mono, fontSize: 40, fontWeight: 700, color: tc, margin: 0 }}
                 data-testid="trust-score">
                {profileUser.trust_score}
              </p>
              <p style={{ fontSize: 11, color: V.dim, fontFamily: V.mono }}>out of 100</p>
            </div>
          </div>

          {/* Actions */}
          {!isSelf && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${V.border}` }}>
              <button
                onClick={() => setShowReportModal(true)}
                data-testid="report-user-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 4,
                  border: `1px solid ${V.error}40`, background: 'transparent',
                  color: V.error, cursor: 'pointer', fontFamily: V.sans, fontSize: 13,
                }}
              >
                <Flag size={13} /> Report User
              </button>
            </div>
          )}

          {isSelf && !profileUser.verified && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${V.border}` }}>
              <button
                onClick={() => navigate('/verify')}
                data-testid="get-verified-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 4, border: 'none',
                  background: V.accent, color: '#000', cursor: 'pointer',
                  fontFamily: V.sans, fontWeight: 700, fontSize: 13,
                  boxShadow: `0 0 12px ${V.accent}40`,
                }}
              >
                <ShieldCheck size={14} /> Get Verified
              </button>
              <p style={{ fontSize: 11, color: V.sub, marginTop: 8 }}>
                Verify your identity to earn +10 trust points
              </p>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            {
              icon: <StarRating value={profileUser.average_rating || 0} />,
              value: (profileUser.average_rating || 0).toFixed(1),
              label: 'Average Rating',
              testId: 'avg-rating',
              color: '#F0B429',
            },
            {
              icon: <Package size={20} color={V.accent} />,
              value: profileUser.total_trades || 0,
              label: 'Total Trades',
              testId: 'total-trades',
              color: V.accent,
            },
            {
              icon: <CheckCircle size={20} color={V.success} />,
              value: profileUser.successful_trades || 0,
              label: 'Successful Trades',
              testId: 'successful-trades',
              color: V.success,
            },
            {
              icon: <AlertTriangle size={20} color={V.warn} />,
              value: profileUser.valid_disputes_count || 0,
              label: 'Disputes',
              testId: 'disputes-count',
              color: V.warn,
            },
          ].map(({ icon, value, label, testId, color }) => (
            <div key={label} style={{ ...surface, textAlign: 'center', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{icon}</div>
              <p style={{ fontFamily: V.mono, fontSize: 24, fontWeight: 700, color, margin: '0 0 4px' }}
                 data-testid={testId}>
                {value}
              </p>
              <p style={{ fontSize: 11, color: V.sub }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Trust Score Breakdown */}
        <div style={{ ...surface, marginBottom: 16 }}>
          <SectionHead label="Trust Score Breakdown" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scoreBreakdown.map(({ label, tooltip, score, max, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: V.sub }}>{label}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle size={13} color={V.dim} style={{ cursor: 'help' }} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span style={{ fontFamily: V.mono, fontSize: 12, fontWeight: 600, color }}>
                    {score}/{max}
                  </span>
                </div>
                <ProgressBar value={score} max={max} color={color} />
              </div>
            ))}
          </div>
        </div>

        {/* Member Since */}
        <div style={{ ...surface }}>
          <p style={{ fontSize: 12, color: V.sub, fontFamily: V.mono }}>
            Member since{' '}
            {new Date(profileUser.created_at).toLocaleDateString('en-ZA', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUserId={profileUser.user_id}
        reportedUserName={profileUser.name}
      />
    </DashboardLayout>
  );
}

export default UserProfile;
