import { Suspense, lazy } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { EnhancedToastProvider } from "@/components/EnhancedToast";
import AdminRoute from "./components/AdminRoute";
import AuthRedirect from "./components/AuthRedirect";
import { SERVICE_RESTRICTIONS } from "@/lib/service-restrictions";
// i18n 初期化
import '@/i18n';
// 重要なページは即座読み込み
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import MaintenancePage from "./pages/MaintenancePage";

// 一般ページの遅延読み込み
const Trade = lazy(() => import("./pages/Trade"));
const Markets = lazy(() => import("./pages/Markets"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WalletOverview = lazy(() => import("./pages/WalletOverview"));
const WalletSetup = lazy(() => import("./pages/WalletSetup"));
const Convert = lazy(() => import("./pages/Convert"));
const FinancialHistory = lazy(() => import("./pages/FinancialHistory"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const Support = lazy(() => import("./pages/Support"));
const MyPage = lazy(() => import("./pages/MyPage"));
const KYC = lazy(() => import("./pages/KYC"));
const Deposit = lazy(() => import("./pages/Deposit"));
const Withdraw = lazy(() => import("./pages/Withdraw"));
const Transfer = lazy(() => import("./pages/Transfer"));
const Announcements = lazy(() => import("./pages/Announcements"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Referral = lazy(() => import("./pages/Referral"));

// 法的情報ページの遅延読み込み
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RiskDisclosure = lazy(() => import("./pages/RiskDisclosure"));

// 管理者ページの遅延読み込み
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const HDWalletAdmin = lazy(() => import("./pages/HDWalletAdmin"));
const WalletAdmin = lazy(() => import("./pages/WalletAdmin"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminReferrals = lazy(() => import("./pages/AdminReferrals"));
const AdminTokens = lazy(() => import("./pages/AdminTokens"));
const SweepManager = lazy(() => import("./pages/SweepManager"));

const queryClient = new QueryClient();

// ローディングコンポーネント
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="text-gray-600">読み込み中...</p>
    </div>
  </div>
);

function App() {
  // fullモード時はメンテナンスページを表示
  if (SERVICE_RESTRICTIONS.shouldShowMaintenancePage()) {
    return <MaintenancePage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <EnhancedToastProvider>
            <BrowserRouter>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/reset" element={<ResetPassword />} />
                <Route path="/redirect" element={<AuthRedirect />} />
                <Route path="/wallet-setup" element={<WalletSetup />} />
                <Route path="/trade" element={<Trade />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/convert" element={<Convert />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                } />
                <Route path="/admin/wallets" element={
                  <AdminRoute>
                    <WalletAdmin />
                  </AdminRoute>
                } />
                <Route path="/admin/hdwallet" element={
                  <AdminRoute>
                    <HDWalletAdmin />
                  </AdminRoute>
                } />
                <Route path="/admin/announcements" element={
                  <AdminRoute>
                    <AdminAnnouncements />
                  </AdminRoute>
                } />
                <Route path="/admin/referrals" element={
                  <AdminRoute>
                    <AdminReferrals />
                  </AdminRoute>
                } />
                <Route path="/admin/tokens" element={
                  <AdminRoute>
                    <AdminTokens />
                  </AdminRoute>
                } />
                <Route path="/admin/sweep-manager" element={
                  <AdminRoute>
                    <SweepManager />
                  </AdminRoute>
                } />
                <Route path="/wallet" element={<WalletOverview />} />
                {/* <Route path="/convert" element={<Convert />} /> Coming Soon */}
                <Route path="/history" element={<FinancialHistory />} />
                <Route path="/security" element={<SecuritySettings />} />
                <Route path="/kyc" element={<KYC />} />
                <Route path="/my-account" element={<MyAccount />} />
                <Route path="/support" element={<Support />} />
                <Route path="/my-page" element={<MyPage />} />
                <Route path="/deposit" element={<Deposit />} />
                <Route path="/withdraw" element={<Withdraw />} />
                <Route path="/transfer" element={<Transfer />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/referral" element={<Referral />} />

                {/* 法的情報ページ */}
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/risk-disclosure" element={<RiskDisclosure />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </EnhancedToastProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
