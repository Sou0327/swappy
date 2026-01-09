import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const AuthRedirect = () => {
  const { user, userRole, loading, roleLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || roleLoading) return;

    if (user && userRole) {
      // Redirect admin users to admin dashboard
      if (userRole === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        // Redirect regular users to user dashboard
        navigate('/dashboard', { replace: true });
      }
    } else if (!user) {
      // Redirect unauthenticated users to login
      navigate('/auth', { replace: true });
    }
  }, [user, userRole, loading, roleLoading, navigate]);

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  return null;
};

export default AuthRedirect;