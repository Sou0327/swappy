import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, Github } from "lucide-react";
import { PLATFORM_NAME } from "@/config/branding";
import { LanguageSwitcher } from "./LanguageSwitcher";

export const Header = () => {
  const { t } = useTranslation('navigation');
  const { user, userRole, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const singleMarketId = import.meta.env.VITE_SINGLE_MARKET_ID;

  // ホーム画面かどうかを判定
  const isHomePage = location.pathname === "/";

  const handleMyPageClick = () => {
    if (userRole === 'admin') {
      navigate("/admin");
    } else {
      navigate("/my-page");
    }
  };

  const baseNav = [
    { to: "/trade", label: t('header.trade') },
    ...(singleMarketId ? [] : [{ to: "/markets", label: t('header.markets') }]),
    { to: "/features", label: t('header.features') },
    { to: "/about", label: t('header.about') },
  ];

  // ホーム画面ではナビゲーションアイテムを空に
  const navigationItems = isHomePage ? [] : [
    ...baseNav,
    ...(userRole === 'admin' ? [{ to: "/admin", label: t('header.admin') }] : [])
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-white/95 border-b border-gray-200/50">
      <div className="container mx-auto px-4 md:px-6 py-4 md:py-6">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="text-xl md:text-2xl font-light text-gray-900 hover:text-gray-700 transition-all duration-300">
              {PLATFORM_NAME}
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-8 lg:space-x-12">
            {navigationItems.map((item) => (
              <Link 
                key={item.to}
                to={item.to} 
                className={`text-sm font-medium text-gray-600 hover:text-gray-900 transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-primary after:transition-all after:duration-300 hover:after:w-full ${
                  item.to === "/admin" ? "text-primary hover:text-primary/80" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden sm:flex items-center gap-4">
            {/* Language Switcher */}
            <LanguageSwitcher compact />

            {user ? (
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMyPageClick}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-full px-4 py-2 transition-all duration-300"
                >
                  {userRole === 'admin' ? t('header.admin') : t('header.myPage')}
                </Button>
                <div className="text-sm text-gray-500 hidden lg:block max-w-32 truncate">
                  {user.email}
                </div>
              </div>
            ) : !isDemoMode ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/auth")}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-full px-4 py-2 transition-all duration-300"
                >
                  {t('header.login')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate("/auth")}
                  className="text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 rounded-full px-6 py-2 transition-all duration-300 hover:scale-105"
                >
                  {t('header.signUp')}
                </Button>
              </div>
            ) : (
              <a
                href="https://github.com/Sou0327/undefined-exchange"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full px-4 py-2 transition-all duration-300"
              >
                <Github className="h-4 w-4" />
                {t('header.viewOnGithub')}
              </a>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="sm" className="rounded-full p-2 hover:bg-gray-100">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-white/95 backdrop-blur-xl border-l border-gray-200">
              <div className="flex flex-col space-y-6 mt-8">
                {/* Mobile Navigation */}
                <div className="flex flex-col space-y-1">
                  {navigationItems.map((item) => (
                    <Link 
                      key={item.to}
                      to={item.to} 
                      onClick={() => setIsOpen(false)}
                      className={`text-base font-medium text-gray-600 hover:text-gray-900 transition-all duration-300 p-3 rounded-xl hover:bg-gray-100 ${
                        item.to === "/admin" ? "text-primary hover:text-primary/80" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>

                {/* Mobile Auth Section */}
                <div className="border-t border-gray-200 pt-6">
                  {/* Mobile Language Switcher */}
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <LanguageSwitcher variant="outline" className="w-full justify-center" />
                  </div>

                  {user ? (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-500 p-3 border-b border-gray-200 pb-3">
                        {user.email}
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-left rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                        onClick={() => {
                          handleMyPageClick();
                          setIsOpen(false);
                        }}
                      >
                        {userRole === 'admin' ? t('header.admin') : t('header.myPage')}
                      </Button>
                    </div>
                  ) : !isDemoMode ? (
                    <div className="space-y-3">
                      <Button
                        variant="ghost"
                        className="w-full rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                        onClick={() => {
                          navigate("/auth");
                          setIsOpen(false);
                        }}
                      >
                        {t('header.login')}
                      </Button>
                      <Button
                        className="w-full bg-gray-900 text-white hover:bg-gray-800 rounded-xl"
                        onClick={() => {
                          navigate("/auth");
                          setIsOpen(false);
                        }}
                      >
                        {t('header.signUp')}
                      </Button>
                    </div>
                  ) : (
                    <a
                      href="https://github.com/Sou0327/undefined-exchange"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full text-base font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-3 transition-all duration-300"
                      onClick={() => setIsOpen(false)}
                    >
                      <Github className="h-5 w-5" />
                      {t('header.viewOnGithub')}
                    </a>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </header>
  );
};
