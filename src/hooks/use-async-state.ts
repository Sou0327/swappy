import { useState, useCallback, useRef, useEffect } from 'react';
import { useErrorHandler } from './use-error-handler';

/**
 * 非同期操作の状態管理フック
 * loading, error, data の統一管理
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown | null;
  lastFetch?: number;
}

export function useAsyncState<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null
  });
  
  const { handleError } = useErrorHandler();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (
    asyncFn: () => Promise<T>,
    options?: {
      onSuccess?: (data: T) => void;
      onError?: (error: unknown) => void;
      showErrorToast?: boolean;
      context?: string;
      abortSignal?: AbortSignal;
    }
  ) => {
    if (!isMountedRef.current) return;

    // AbortSignalが既にキャンセルされているかチェック
    if (options?.abortSignal?.aborted) {
      return { data: null, error: new Error('Operation was cancelled') };
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await asyncFn();

      // 実行後に再度キャンセルチェック
      if (options?.abortSignal?.aborted) {
        return { data: null, error: new Error('Operation was cancelled') };
      }

      if (!isMountedRef.current) return;

      const now = Date.now();
      setState({ data, loading: false, error: null, lastFetch: now });
      options?.onSuccess?.(data);

      return { data, error: null };
    } catch (error) {
      // キャンセルエラーの場合は特別扱い
      if (options?.abortSignal?.aborted || (error as Error)?.name === 'AbortError') {
        if (isMountedRef.current) {
          setState(prev => ({ ...prev, loading: false }));
        }
        return { data: null, error: new Error('Operation was cancelled') };
      }

      if (!isMountedRef.current) return;

      const normalizedError = handleError(
        error,
        options?.context,
        options?.showErrorToast ?? true
      );

      setState(prev => ({
        ...prev,
        loading: false,
        error: normalizedError
      }));

      options?.onError?.(normalizedError);

      return { data: null, error: normalizedError };
    }
  }, [handleError]);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const setData = useCallback((data: T | null) => {
    setState(prev => ({ ...prev, data }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: unknown | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
    setLoading,
    setError,
    isIdle: !state.loading && !state.error && !state.data
  };
}

/**
 * フォーム送信用の非同期状態管理
 */
export function useFormSubmit<T = unknown>() {
  const asyncState = useAsyncState<T>();
  
  const submitForm = useCallback(async <TForm>(
    formData: TForm,
    submitFn: (data: TForm) => Promise<T>,
    options?: {
      onSuccess?: (data: T, formData: TForm) => void;
      onError?: (error: unknown, formData: TForm) => void;
      context?: string;
    }
  ) => {
    const result = await asyncState.execute(
      () => submitFn(formData),
      {
        context: options?.context || 'Form Submit',
        onSuccess: (data) => options?.onSuccess?.(data, formData),
        onError: (error) => options?.onError?.(error, formData)
      }
    );
    
    return result;
  }, [asyncState]);

  return {
    ...asyncState,
    submitForm,
    isSubmitting: asyncState.loading
  };
}