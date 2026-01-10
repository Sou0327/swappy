import { useState, useEffect, memo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/use-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import MobileBottomNavigation from "./MobileBottomNavigation";
import DemoBanner from "./DemoBanner";
import { PLATFORM_NAME } from "@/config/branding";
import {
  LayoutDashboard,
  Wallet,
  Send,
  ArrowLeftRight,
  Users,
  Settings,
  User,
  Shield,
  FileText,
  Clock,
  HelpCircle,
  LogOut,
  Home,
  ChevronDown,
  ChevronRight,
  Menu,
  Bell,
  X,
  CheckCircle,
  Megaphone,
  AlertTriangle,
  XCircle
} from "lucide-react";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  // 稼ぐメニューは非表示のため、展開状態は不要
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [adminMenuExpanded, setAdminMenuExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, userRole, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // 通知システム
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading: notificationsLoading } = useNotifications();

  useEffect(() => {
    // デモモードの場合はリダイレクトしない
    if (!user && !isDemoMode) {
      navigate("/auth");
    }
  }, [user, isDemoMode, navigate]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "ログアウトしました",
        description: "正常にログアウトされました。",
      });
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "ログアウトエラー",
        description: "ログアウト中にエラーが発生しました。",
        variant: "destructive",
      });
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const sidebarItems = [
    { icon: LayoutDashboard, label: "ダッシュボード", path: "/dashboard" },
    { icon: Megaphone, label: "お知らせ", path: "/announcements" },
    { icon: Wallet, label: "ウォレット", path: "/wallet" },
    { icon: Send, label: "送金", path: "/transfer" },
    // 稼ぐメニューは画面上から非表示（ルートは残置）
    { icon: ArrowLeftRight, label: "両替", path: "/convert" },
    { icon: Users, label: "紹介プログラム", path: "/referral" },
    {
      icon: Settings,
      label: "設定",
      expandable: true,
      expanded: settingsExpanded,
      setExpanded: setSettingsExpanded,
      subItems: [
        { label: "マイアカウント", path: "/my-account" },
        { label: "セキュリティ", path: "/security" },
        { label: "KYC", path: "/kyc" },
        { label: "履歴", path: "/history" },
        { label: "サポート", path: "/support" }
      ]
    },
    // 管理者専用メニュー
    ...(userRole === 'admin' ? [{
      icon: Shield,
      label: "管理者メニュー",
      expandable: true,
      expanded: adminMenuExpanded,
      setExpanded: setAdminMenuExpanded,
      subItems: [
        { label: "管理ダッシュボード", path: "/admin" },
        { label: "ウォレット管理", path: "/admin/wallets" },
        { label: "HDウォレット", path: "/admin/hdwallet" },
        { label: "スイープ管理", path: "/admin/sweep-manager" },
        { label: "お知らせ管理", path: "/admin/announcements" },
        { label: "紹介管理", path: "/admin/referrals" },
        { label: "トークン管理", path: "/admin/tokens" }
      ]
    }] : [])
  ];

  // Helper component for sidebar content
  const SidebarContent = memo(({ onItemClick }: { onItemClick?: () => void }) => (
    <nav className="space-y-1">
      {sidebarItems.map((item, index) => (
        <div key={index}>
          {item.expandable ? (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  item.setExpanded?.(!item.expanded);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors ${item.subItems?.some(subItem => isActive(subItem.path))
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600"
                  }`}
              >
                <div className="flex items-center">
                  <item.icon className="mr-3 h-4 w-4" />
                  {item.label}
                </div>
                {item.expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {item.expanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {item.subItems?.map((subItem, subIndex) => (
                    <Link
                      key={subIndex}
                      to={subItem.path}
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick?.();
                      }}
                      className={`block px-3 py-2 text-sm rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors ${isActive(subItem.path)
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600"
                        }`}
                    >
                      {subItem.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              to={item.path}
              onClick={(e) => {
                e.stopPropagation();
                onItemClick?.();
              }}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors ${isActive(item.path)
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600"
                }`}
              style={{ zIndex: 10000 }}
            >
              <item.icon className="mr-3 h-4 w-4" />
              {item.label}
            </Link>
          )}
        </div>
      ))}

      <div className="mt-4">
        <button
          onClick={() => {
            if (isDemoMode) {
              navigate("/");
            } else {
              handleSignOut();
            }
            onItemClick?.();
          }}
          className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            isDemoMode
              ? "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              : "text-gray-600 hover:bg-red-50 hover:text-red-600"
          }`}
        >
          {isDemoMode ? (
            <Home className="mr-3 h-4 w-4" />
          ) : (
            <LogOut className="mr-3 h-4 w-4" />
          )}
          {isDemoMode ? "ホームに戻る" : "サインアウト"}
        </button>
      </div>
    </nav>
  ));

  // デモバナーの高さを考慮
  const bannerHeight = isDemoMode ? "pt-[88px] md:pt-[92px]" : "pt-14 md:pt-16";
  const sidebarTop = isDemoMode ? "top-[88px] md:top-[92px]" : "top-14 md:top-16";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo Banner - デモモード時のみ表示 */}
      {isDemoMode && (
        <div className="fixed top-0 left-0 right-0 z-[60]">
          <DemoBanner />
        </div>
      )}

      {/* Top Header */}
      <div className={`bg-white border-b border-gray-200 fixed left-0 right-0 z-50 h-14 md:h-16 ${isDemoMode ? "top-[40px]" : "top-0"}`}>
        <div className="flex items-center justify-between h-full px-4 md:px-6">
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Mobile Menu Button - Shown on mobile/tablet, hidden on desktop */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 bg-white border-r border-gray-200">
                <SheetTitle className="sr-only">メニュー</SheetTitle>
                <div className="mt-8">
                  <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-primary rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm md:text-lg">{PLATFORM_NAME.charAt(0)}</span>
              </div>
              <span className="font-bold text-base md:text-lg lg:text-xl text-gray-900">
                {PLATFORM_NAME}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-4 xl:gap-6">
              <Link
                to="/markets"
                className={`px-2 xl:px-3 py-2 text-sm font-medium hover:text-primary transition-colors ${isActive("/markets") ? "text-primary" : "text-gray-600"
                  }`}
              >
                マーケット
              </Link>
              <Link
                to="/trade"
                className={`px-2 xl:px-3 py-2 text-sm font-medium hover:text-primary transition-colors ${isActive("/trade") ? "text-primary" : "text-gray-600"
                  }`}
              >
                取引
              </Link>
              <Link
                to="/transfer"
                className={`px-2 xl:px-3 py-2 text-sm font-medium hover:text-primary transition-colors ${isActive("/transfer") ? "text-primary" : "text-gray-600"
                  }`}
              >
                送金
              </Link>
              {/* 稼ぐは非表示 */}
              <Link
                to="/convert"
                className={`px-2 xl:px-3 py-2 text-sm font-medium hover:text-primary transition-colors ${isActive("/convert") ? "text-primary" : "text-gray-600"
                  }`}
              >
                両替
              </Link>
              {userRole === 'admin' && (
                <Link
                  to="/admin"
                  className={`px-2 xl:px-3 py-2 text-sm font-medium hover:text-primary transition-colors ${isActive("/admin") ? "text-primary" : "text-gray-600"
                    }`}
                >
                  管理画面
                </Link>
              )}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 md:gap-3">
            {/* Admin button - Show on mobile only for admins */}
            {userRole === 'admin' && (
              <Button
                size="sm"
                variant="outline"
                className="md:hidden text-xs px-2 transition-all duration-200 active:scale-95"
                onClick={() => navigate("/admin")}
              >
                <Shield className="h-3 w-3" />
              </Button>
            )}

            {/* Mobile: Show only deposit button */}
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 active:bg-primary/80 text-xs px-3 md:px-4 md:text-sm transition-all duration-200 active:scale-95"
              onClick={() => navigate("/deposit")}
            >
              入金
            </Button>

            {/* Hide withdraw button on mobile, show on md+ */}
            <Button
              size="sm"
              variant="outline"
              className="hidden md:inline-flex text-xs md:text-sm px-2 md:px-4 transition-all duration-200 active:scale-95"
              onClick={() => navigate("/withdraw")}
            >
              出金
            </Button>

            {/* 通知アイコン - Hide on mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative hidden md:inline-flex">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 max-h-96 overflow-y-auto"
                sideOffset={8}
              >
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">通知</h3>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={markAllAsRead}
                      >
                        すべて既読
                      </Button>
                    )}
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      読み込み中...
                    </div>
                  ) : notifications && notifications.length > 0 ? (
                    notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors ${!notification.read ? 'bg-blue-50' : ''
                          }`}
                        onClick={() => {
                          if (!notification.read) {
                            markAsRead(notification.id);
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {notification.type === 'kyc' ? (
                              <Shield className="h-4 w-4 text-blue-600" />
                            ) : notification.type === 'success' ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : notification.type === 'warning' ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            ) : notification.type === 'error' ? (
                              <XCircle className="h-4 w-4 text-red-600" />
                            ) : (
                              <Bell className="h-4 w-4 text-gray-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{notification.title}</p>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(notification.createdAt).toLocaleString('ja-JP', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      新しい通知はありません
                    </div>
                  )}
                </div>

                {notifications && notifications.length > 10 && (
                  <div className="p-3 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => navigate("/notifications")}
                    >
                      すべての通知を見る
                    </Button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User avatar - Hide on mobile */}
            <div className="hidden md:flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`flex ${bannerHeight} pb-16 lg:pb-0`}>
        {/* Desktop Sidebar */}
        <div
          className={`hidden lg:block w-64 bg-white border-r border-gray-200 min-h-screen fixed left-0 ${sidebarTop} z-[100] pointer-events-auto`}
          style={{
            touchAction: 'auto'
          }}
        >
          <div className="p-4">
            <SidebarContent />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-64 min-h-screen relative z-[10] overflow-hidden">
          <div className="p-3 md:p-6 max-w-full overflow-x-hidden">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavigation />
    </div>
  );
};

export default memo(DashboardLayout);
