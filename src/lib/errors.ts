/**
 * 統一エラーハンドリングシステム
 * アプリケーション全体で一貫したエラー処理を提供
 */

export enum ErrorType {
  NETWORK = 'network',
  AUTH = 'auth', 
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  NOT_FOUND = 'not_found',
  SERVER = 'server',
  UNKNOWN = 'unknown'
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  code?: string;
}

export class AppErrorHandler {
  /**
   * エラーを標準化された形式に変換
   */
  static normalize(error: unknown): AppError {
    // すでに正規化されたエラー
    if (error && typeof error === 'object' && 'type' in error) {
      return error as AppError;
    }

    // Supabaseエラー
    if (error && typeof error === 'object' && 'message' in error) {
      const supabaseError = error as { message: string; code?: string; details?: string };
      
      // 認証エラー
      if (supabaseError.message.includes('Invalid login credentials') ||
          supabaseError.message.includes('not authenticated') ||
          supabaseError.code === 'PGRST301') {
        return {
          type: ErrorType.AUTH,
          message: 'ログイン情報が正しくありません',
          details: supabaseError.message,
          code: supabaseError.code
        };
      }

      // 権限エラー
      if (supabaseError.message.includes('permission denied') ||
          supabaseError.message.includes('insufficient_privilege') ||
          supabaseError.code === 'PGRST116') {
        return {
          type: ErrorType.PERMISSION,
          message: 'この操作を実行する権限がありません',
          details: supabaseError.message,
          code: supabaseError.code
        };
      }

      // 見つからない
      if (supabaseError.code === 'PGRST116' || supabaseError.message.includes('not found')) {
        return {
          type: ErrorType.NOT_FOUND,
          message: 'リクエストされたデータが見つかりません',
          details: supabaseError.message,
          code: supabaseError.code
        };
      }

      // サーバーエラー
      return {
        type: ErrorType.SERVER,
        message: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
        details: supabaseError.message,
        code: supabaseError.code
      };
    }

    // ネットワークエラー
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        type: ErrorType.NETWORK,
        message: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
        details: error.message
      };
    }

    // バリデーションエラー
    if (error instanceof Error && error.message.includes('validation')) {
      return {
        type: ErrorType.VALIDATION,
        message: '入力内容に問題があります。確認して再度お試しください。',
        details: error.message
      };
    }

    // 不明なエラー
    return {
      type: ErrorType.UNKNOWN,
      message: '予期しないエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    };
  }

  /**
   * ユーザー向けエラーメッセージを取得
   */
  static getUserMessage(error: unknown): string {
    const normalized = this.normalize(error);
    return normalized.message;
  }

  /**
   * 開発者向け詳細情報を取得
   */
  static getDetails(error: unknown): string | undefined {
    const normalized = this.normalize(error);
    return normalized.details;
  }

  /**
   * エラーをコンソールに記録
   */
  static log(error: unknown, context?: string) {
    const normalized = this.normalize(error);
    console.error(`[${normalized.type.toUpperCase()}]${context ? ` ${context}:` : ''} ${normalized.message}`, {
      details: normalized.details,
      code: normalized.code,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * エラートースト表示用のヘルパー関数
 */
export function getErrorToast(error: unknown) {
  const normalized = AppErrorHandler.normalize(error);
  
  return {
    title: getErrorTitle(normalized.type),
    description: normalized.message,
    variant: "destructive" as const,
  };
}

function getErrorTitle(type: ErrorType): string {
  switch (type) {
    case ErrorType.NETWORK:
      return 'ネットワークエラー';
    case ErrorType.AUTH:
      return '認証エラー';
    case ErrorType.VALIDATION:
      return '入力エラー';
    case ErrorType.PERMISSION:
      return '権限エラー';
    case ErrorType.NOT_FOUND:
      return 'データが見つかりません';
    case ErrorType.SERVER:
      return 'サーバーエラー';
    default:
      return 'エラー';
  }
}

/**
 * カスタムエラー作成用のヘルパー関数
 */
export function createError(type: ErrorType, message: string, details?: string, code?: string): AppError {
  return { type, message, details, code };
}