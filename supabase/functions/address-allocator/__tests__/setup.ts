/**
 * テストセットアップ
 * Deno環境でのテスト実行に必要な設定
 */

// Deno環境変数の設定
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
Deno.env.set('SUPABASE_ANON_KEY', 'test-anon-key');

/**
 * グローバルテストヘルパー
 */
export const testHelpers = {
  /**
   * HTTPリクエストのモック作成
   */
  createMockRequest: (
    method: string,
    url: string,
    body?: any,
    headers?: Record<string, string>
  ): Request => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
      ...headers,
    };

    const requestInit: RequestInit = {
      method,
      headers: defaultHeaders,
    };

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    return new Request(url, requestInit);
  },

  /**
   * レスポンスのJSON取得
   */
  getResponseJson: async (response: Response): Promise<any> => {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  /**
   * エラーレスポンスの検証
   */
  assertErrorResponse: (
    response: Response,
    expectedStatus: number,
    expectedMessage?: string
  ) => {
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${response.status}`
      );
    }

    if (expectedMessage) {
      testHelpers.getResponseJson(response).then((json: any) => {
        if (!json.error?.includes(expectedMessage)) {
          throw new Error(
            `Expected error message to include "${expectedMessage}", got "${json.error}"`
          );
        }
      });
    }
  },

  /**
   * 成功レスポンスの検証
   */
  assertSuccessResponse: async (
    response: Response,
    expectedData?: Record<string, any>
  ) => {
    if (!response.ok) {
      const json = await testHelpers.getResponseJson(response);
      throw new Error(
        `Expected successful response, got ${response.status}: ${JSON.stringify(json)}`
      );
    }

    if (expectedData) {
      const json = await testHelpers.getResponseJson(response);
      for (const [key, value] of Object.entries(expectedData)) {
        if (json[key] !== value) {
          throw new Error(
            `Expected ${key} to be ${value}, got ${json[key]}`
          );
        }
      }
    }
  },
};

/**
 * テスト用のアサーション関数
 */
export const assert = {
  /**
   * 等価性チェック
   */
  equal: (actual: any, expected: any, message?: string) => {
    if (actual !== expected) {
      throw new Error(
        message ||
          `Assertion failed: expected ${expected}, got ${actual}`
      );
    }
  },

  /**
   * 真偽値チェック
   */
  isTrue: (value: any, message?: string) => {
    if (value !== true) {
      throw new Error(
        message || `Assertion failed: expected true, got ${value}`
      );
    }
  },

  /**
   * null/undefinedチェック
   */
  isNotNull: (value: any, message?: string) => {
    if (value === null || value === undefined) {
      throw new Error(
        message || `Assertion failed: expected non-null value`
      );
    }
  },

  /**
   * 配列の長さチェック
   */
  arrayLength: (array: any[], expectedLength: number, message?: string) => {
    if (!Array.isArray(array)) {
      throw new Error(
        message || `Assertion failed: expected array, got ${typeof array}`
      );
    }
    if (array.length !== expectedLength) {
      throw new Error(
        message ||
          `Assertion failed: expected array length ${expectedLength}, got ${array.length}`
      );
    }
  },

  /**
   * オブジェクトのプロパティ存在チェック
   */
  hasProperty: (obj: any, property: string, message?: string) => {
    if (!(property in obj)) {
      throw new Error(
        message ||
          `Assertion failed: expected object to have property "${property}"`
      );
    }
  },

  /**
   * 例外スローチェック
   */
  throws: async (fn: () => Promise<any> | any, message?: string) => {
    let threw = false;
    try {
      await fn();
    } catch (error) {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        message || `Assertion failed: expected function to throw`
      );
    }
  },

  /**
   * 例外がスローされないことをチェック
   */
  doesNotThrow: async (fn: () => Promise<any> | any, message?: string) => {
    try {
      await fn();
    } catch (error) {
      throw new Error(
        message ||
          `Assertion failed: expected function not to throw, but got: ${error}`
      );
    }
  },
};

/**
 * テストユーティリティ
 */
export const testUtils = {
  /**
   * 非同期wait
   */
  wait: (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Uint8Arrayの比較
   */
  arraysEqual: (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  },

  /**
   * ランダムな文字列生成（テスト用）
   */
  randomString: (length = 16): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
};
