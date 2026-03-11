import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Star, Shield, ShieldCheck, Award, CheckCircle, AlertTriangle, TrendingUp, Package, User as UserIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function UserProfile() {
  const [user, setUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { userId } = useParams();

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      // Get current logged in user
      const userRes = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);

      // Get profile user (could be self or another user)
      const targetUserId = userId || userRes.data.user_id;
      const profileRes = await axios.get(`${API}/users/${targetUserId}/profile`, { withCredentials: true });
      setProfileUser(profileRes.data);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      toast.error('Profile not found');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getTrustScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrustScoreBg = (score) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-blue-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getBadgeIcon = (badge) => {
    switch(badge) {
      case 'Verified': return <ShieldCheck className="w-5 h-5 text-blue-600" />;
      case 'Gold': return <Award className="w-5 h-5 text-yellow-500" />;
      case 'Silver': return <Award className="w-5 h-5 text-slate-400" />;
      default: return <Shield className="w-5 h-5 text-slate-400" />;
    }
  };

  const getBadgeStyle = (badge) => {
    switch(badge) {
      case 'Verified': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Gold': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Silver': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const StarRating = ({ value, size = 'w-5 h-5' }) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${size} ${
              star <= value
                ? 'fill-yellow-400 text-yellow-400'
                : star - 0.5 <= value
                ? 'fill-yellow-400/50 text-yellow-400'
                : 'text-slate-300'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!profileUser) {
    return null;
  }

  const isSelf = user?.user_id === profileUser.user_id;

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>

        {/* Profile Header */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              {profileUser.picture ? (
                <img 
                  src={profileUser.picture} 
                  alt={profileUser.name} 
                  className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-white shadow-lg">
                  <UserIcon className="w-12 h-12 text-primary" />
                </div>
              )}
              {profileUser.verified && (
                <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">{profileUser.name}</h1>
                {profileUser.suspended && (
                  <Badge className="bg-red-100 text-red-800">Suspended</Badge>
                )}
              </div>
              <p className="text-slate-500 mb-3">{profileUser.email}</p>
              
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {profileUser.badges && profileUser.badges.map((badge, index) => (
                  <Badge 
                    key={index} 
                    className={`${getBadgeStyle(badge)} flex items-center gap-1.5 px-3 py-1`}
                  >
                    {getBadgeIcon(badge)}
                    {badge} Trust Badge
                  </Badge>
                ))}
                {(!profileUser.badges || profileUser.badges.length === 0) && (
                  <span className="text-sm text-slate-400">No badges yet</span>
                )}
              </div>
            </div>

            {/* Trust Score */}
            <div className={`${getTrustScoreBg(profileUser.trust_score)} rounded-xl p-6 text-center min-w-[140px]`}>
              <p className="text-sm text-slate-600 mb-1">Trust Score</p>
              <p className={`text-4xl font-bold ${getTrustScoreColor(profileUser.trust_score)}`} data-testid="trust-score">
                {profileUser.trust_score}
              </p>
              <p className="text-xs text-slate-500">out of 100</p>
            </div>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <StarRating value={profileUser.average_rating || 0} size="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="avg-rating">
              {(profileUser.average_rating || 0).toFixed(1)}
            </p>
            <p className="text-xs text-slate-500">Average Rating</p>
          </Card>

          <Card className="p-4 text-center">
            <Package className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900" data-testid="total-trades">
              {profileUser.total_trades || 0}
            </p>
            <p className="text-xs text-slate-500">Total Trades</p>
          </Card>

          <Card className="p-4 text-center">
            <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900" data-testid="successful-trades">
              {profileUser.successful_trades || 0}
            </p>
            <p className="text-xs text-slate-500">Successful Trades</p>
          </Card>

          <Card className="p-4 text-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900" data-testid="disputes-count">
              {profileUser.valid_disputes_count || 0}
            </p>
            <p className="text-xs text-slate-500">Disputes</p>
          </Card>
        </div>

        {/* Trust Score Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Trust Score Breakdown
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Transaction History</span>
                <span className="font-medium">{Math.min(40, (profileUser.successful_trades || 0) * 4)}/40</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, (profileUser.successful_trades || 0) * 10)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">User Ratings</span>
                <span className="font-medium">{Math.round((profileUser.average_rating || 0) * 6)}/30</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-yellow-400 rounded-full transition-all"
                  style={{ width: `${((profileUser.average_rating || 0) / 5) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Dispute Record</span>
                <span className="font-medium">{Math.max(0, 20 - (profileUser.valid_disputes_count || 0) * 5)}/20</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, 100 - (profileUser.valid_disputes_count || 0) * 25)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Verification Status</span>
                <span className="font-medium">{profileUser.verified ? 10 : 0}/10</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: profileUser.verified ? '100%' : '0%' }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Member Since */}
        <Card className="p-4">
          <p className="text-sm text-slate-500">
            Member since {new Date(profileUser.created_at).toLocaleDateString('en-ZA', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default UserProfile;
