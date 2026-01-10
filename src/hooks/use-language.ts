import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages, type SupportedLanguage } from '@/i18n';

/**
 * 言語切替用カスタムフック
 *
 * @example
 * const { currentLanguage, changeLanguage, supportedLanguages } = useLanguage();
 *
 * // 言語切替
 * changeLanguage('ja');
 *
 * // 現在の言語を取得
 * console.log(currentLanguage); // 'en' or 'ja'
 */
export function useLanguage() {
  const { i18n } = useTranslation();

  /**
   * 言語を切り替える
   * サポート外の言語が指定された場合は何もしない（エラーにならない）
   */
  const changeLanguage = useCallback(
    async (lng: SupportedLanguage) => {
      // サポートされている言語かチェック
      if (!supportedLanguages.includes(lng)) {
        return;
      }
      try {
        await i18n.changeLanguage(lng);
      } catch (error) {
        console.error('Failed to change language:', error);
      }
    },
    [i18n]
  );

  /**
   * 現在の言語を取得
   * サポート外の言語の場合は 'en' を返す
   */
  const currentLanguage = (
    supportedLanguages.includes(i18n.language as SupportedLanguage)
      ? i18n.language
      : 'en'
  ) as SupportedLanguage;

  return {
    /** 現在の言語 */
    currentLanguage,
    /** 言語を切り替える関数 */
    changeLanguage,
    /** サポートされている言語のリスト */
    supportedLanguages,
  };
}
