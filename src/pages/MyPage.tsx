import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const MyPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    
    // Redirect to the new dashboard
    navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  );
};

export default MyPage;