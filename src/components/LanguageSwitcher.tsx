import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface LanguageOption {
  code: 'en' | 'ja';
  label: string;
  flag: string;
}

const languages: LanguageOption[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

interface LanguageSwitcherProps {
  /** ボタンのバリアント */
  variant?: 'ghost' | 'outline' | 'default';
  /** コンパクト表示（アイコンのみ） */
  compact?: boolean;
  /** 追加のクラス名 */
  className?: string;
}

/**
 * 言語切替コンポーネント
 *
 * @example
 * // ヘッダーに配置（コンパクト）
 * <LanguageSwitcher compact />
 *
 * // 設定ページに配置（フル表示）
 * <LanguageSwitcher />
 */
export function LanguageSwitcher({
  variant = 'ghost',
  compact = false,
  className = '',
}: LanguageSwitcherProps) {
  const { currentLanguage, changeLanguage } = useLanguage();
  const { t } = useTranslation();

  const currentLang = languages.find((l) => l.code === currentLanguage) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={cn("gap-2", className)}
          aria-label={t('common.language')}
        >
          <Globe className="h-4 w-4" />
          {!compact && (
            <span className="hidden sm:inline">
              {currentLang.flag} {currentLang.label}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={cn(
              "gap-2 cursor-pointer",
              currentLanguage === lang.code && "bg-accent"
            )}
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
