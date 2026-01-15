import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type UserProfile = {
  wallet_setup_completed?: boolean
};

const AuthRedirect = () => {
  const { user, userRole, loading, roleLoading } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (loading || roleLoading || !user) return;

    // ユーザープロファイル取得
    if (!userProfile) {
      const fetchProfile = async () => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_setup_completed')
          .eq('id', user.id)
          .single();
        setUserProfile(profile || { wallet_setup_completed: false });
      };
      fetchProfile();
      return;
    }

    // ウォレットセットアップ確認（管理者はスキップ）
    if (userRole !== 'admin' && !userProfile.wallet_setup_completed) {
      navigate('/wallet-setup', { replace: true });
      return;
    }

    if (userRole === 'admin') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [user, userRole, userProfile, loading, roleLoading, navigate]);

  if (loading || roleLoading || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  return null;
};

export default AuthRedirect;