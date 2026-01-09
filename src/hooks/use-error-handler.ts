import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AppErrorHandler, getErrorToast } from '@/lib/errors';

/**
 * 統一エラーハンドリングフック
 * エラーの正規化、ログ出力、ユーザーへの通知を自動化
 */
export function useErrorHandler() {
  const { toast } = useToast();

  const handleError = useCallback((error: unknown, context?: string, showToast = true) => {
    // エラーをログに記録
    AppErrorHandler.log(error, context);

    // ユーザーにトースト通知
    if (showToast) {
      toast(getErrorToast(error));
    }

    // 正規化されたエラーを返す
    return AppErrorHandler.normalize(error);
  }, [toast]);

  const handleAsyncError = useCallback(async <T>(
    asyncOperation: () => Promise<T>,
    context?: string,
    showToast = true
  ): Promise<{ data: T | null; error: unknown | null }> => {
    try {
      const data = await asyncOperation();
      return { data, error: null };
    } catch (error) {
      const normalizedError = handleError(error, context, showToast);
      return { data: null, error: normalizedError };
    }
  }, [handleError]);

  return {
    handleError,
    handleAsyncError,
    getUserMessage: AppErrorHandler.getUserMessage,
    getDetails: AppErrorHandler.getDetails
  };
}

/**
 * React Query用のエラーハンドラー
 */
export function useQueryErrorHandler() {
  const { handleError } = useErrorHandler();

  return useCallback((error: unknown) => {
    handleError(error, 'Query Error', true);
  }, [handleError]);
}