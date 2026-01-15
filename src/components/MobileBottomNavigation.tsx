import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Bell,
  User
} from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
}

const MobileBottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useNotifications();

  // Trade and Convert are Coming Soon, removed from mobile navigation
  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: "ホーム", path: "/dashboard" },
    { icon: TrendingUp, label: "マーケット", path: "/markets" },
    { icon: Wallet, label: "ウォレット", path: "/wallet" },
    { icon: Bell, label: "通知", path: "/notifications" },
    { icon: User, label: "設定", path: "/my-account" }
  ];

  const isActive = (path: string) => {
    // ダッシュボードの場合は exact match
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    // その他の場合は path で始まるかチェック
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
        <div className="flex items-center justify-around py-2 px-4">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const isNotificationPage = item.path === "/notifications";
            const showBadge = isNotificationPage && unreadCount > 0;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center p-2 min-w-0 flex-1 min-h-[44px] ${
                  active
                    ? "text-primary"
                    : "text-gray-500 hover:text-gray-700 active:text-primary/80"
                } transition-all duration-200 active:scale-95 relative`}
              >
                <div className="relative">
                  <item.icon
                    className={`h-5 w-5 mb-1 ${
                      active ? "text-primary" : "text-gray-500"
                    }`}
                  />
                  {/* 未読バッジ - Apple風の小さな赤い丸 */}
                  {showBadge && (
                    <div className="absolute -top-1 -right-1 bg-red-600 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${
                  active ? "text-primary" : "text-gray-500"
                } truncate max-w-full`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Bottom padding to prevent content from being hidden behind navigation */}
      <div className="h-16 lg:hidden" />
    </>
  );
};

export default MobileBottomNavigation;
