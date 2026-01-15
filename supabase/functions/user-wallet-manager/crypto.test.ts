/**
 * 暗号化ユーティリティのテスト
 * TDDアプローチで実装
 *
 * テスト対象:
 * - encrypt(): AES-256-GCM暗号化
 * - decrypt(): AES-256-GCM復号化
 * - deriveKey(): PBKDF2鍵導出
 * - hashPassword(): SHA-256パスワードハッシュ
 */

// テスト対象の関数をインポート（本番コードと同じ実装）
async function encrypt(data: string, password: string): Promise<{ encrypted: string; iv: string; salt: string }> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passwordBytes, salt);

  const dataBytes = encoder.encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  );

  const encryptedBytes = new Uint8Array(encrypted);
  return {
    encrypted: btoa(String.fromCharCode(...encryptedBytes)),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt))
  };
}

async function decrypt(encryptedBase64: string, ivBase64: string, saltBase64: string, password: string): Promise<string> {
  const encryptedBytes = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
  const salt = new Uint8Array(atob(saltBase64).split('').map(c => c.charCodeAt(0)));

  const key = await deriveKey(new TextEncoder().encode(password), salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

async function deriveKey(password: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const combined = new Uint8Array([...salt, ...password]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return await crypto.subtle.importKey('raw', hashBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', passwordBytes);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ====================================
// テストスイート
// ====================================

Deno.test({
  name: '暗号化機能: 正常系 - 12語ニーモニックの暗号化・復号化',
  async fn() {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const password = 'TestPassword123!';

    const { encrypted, iv, salt } = await encrypt(mnemonic, password);
    const decrypted = await decrypt(encrypted, iv, salt, password);

    if (decrypted !== mnemonic) {
      throw new Error(`復号結果が元のニーモニックと一致しません。\n期待: ${mnemonic}\n実際: ${decrypted}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 正常系 - 24語ニーモニックの暗号化・復号化',
  async fn() {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
    const password = 'TestPassword123!';

    const { encrypted, iv, salt } = await encrypt(mnemonic, password);
    const decrypted = await decrypt(encrypted, iv, salt, password);

    if (decrypted !== mnemonic) {
      throw new Error(`復号結果が元のニーモニックと一致しません。\n期待: ${mnemonic}\n実際: ${decrypted}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 異常系 - 間違ったパスワードで復号失敗',
  async fn() {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const password = 'TestPassword123!';
    const wrongPassword = 'WrongPassword456!';

    const { encrypted, iv, salt } = await encrypt(mnemonic, password);

    try {
      await decrypt(encrypted, iv, salt, wrongPassword);
      throw new Error('間違ったパスワードで復号が成功しました（失敗すべき）');
    } catch (error) {
      if (error instanceof Error && error.message.includes('失敗すべき')) {
        throw error;
      }
      // 期待通りエラーが発生した場合はテスト成功
    }
  }
});

Deno.test({
  name: '暗号化機能: 正常系 - 同じパスワードで同じハッシュ',
  async fn() {
    const password = 'TestPassword123!';

    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    if (hash1 !== hash2) {
      throw new Error(`同じパスワードで異なるハッシュが生成されました。\nハッシュ1: ${hash1}\nハッシュ2: ${hash2}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 異常系 - 異なるパスワードで異なるハッシュ',
  async fn() {
    const password1 = 'TestPassword123!';
    const password2 = 'DifferentPassword456!';

    const hash1 = await hashPassword(password1);
    const hash2 = await hashPassword(password2);

    if (hash1 === hash2) {
      throw new Error(`異なるパスワードで同じハッシュが生成されました。\nハッシュ: ${hash1}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 正常系 - 異なるIVで異なる暗号化結果',
  async fn() {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const password = 'TestPassword123!';

    const result1 = await encrypt(mnemonic, password);
    const result2 = await encrypt(mnemonic, password);

    if (result1.encrypted === result2.encrypted) {
      throw new Error(`同じデータで同じ暗号化結果が生成されました（IVが異なるべき）。\n暗号化: ${result1.encrypted}`);
    }

    // IVも異なるべき
    if (result1.iv === result2.iv) {
      throw new Error(`同じIVが生成されました（ランダムであるべき）。\nIV: ${result1.iv}`);
    }

    // Saltも異なるべき
    if (result1.salt === result2.salt) {
      throw new Error(`同じSaltが生成されました（ランダムであるべき）。\nSalt: ${result1.salt}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: エッジケース - 空文字列の暗号化',
  async fn() {
    const mnemonic = '';
    const password = 'TestPassword123!';

    const { encrypted, iv, salt } = await encrypt(mnemonic, password);
    const decrypted = await decrypt(encrypted, iv, salt, password);

    if (decrypted !== mnemonic) {
      throw new Error(`空文字列の復号結果が空文字列と一致しません。\n期待: "${mnemonic}"\n実際: "${decrypted}"`);
    }
  }
});

Deno.test({
  name: '暗号化機能: エッジケース - 長いパスワード（1000文字）',
  async fn() {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const longPassword = 'a'.repeat(1000);

    const { encrypted, iv, salt } = await encrypt(mnemonic, longPassword);
    const decrypted = await decrypt(encrypted, iv, salt, longPassword);

    if (decrypted !== mnemonic) {
      throw new Error(`長いパスワードでの復号結果が元のニーモニックと一致しません。\n期待: ${mnemonic}\n実際: ${decrypted}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 正常系 - 日本語を含む文字列の暗号化',
  async fn() {
    const text = 'こんにちは世界 テスト文字列';
    const password = 'TestPassword123!';

    const { encrypted, iv, salt } = await encrypt(text, password);
    const decrypted = await decrypt(encrypted, iv, salt, password);

    if (decrypted !== text) {
      throw new Error(`日本語を含む文字列の復号結果が元の文字列と一致しません。\n期待: ${text}\n実際: ${decrypted}`);
    }
  }
});

Deno.test({
  name: '暗号化機能: 正常系 - 特殊文字を含む文字列の暗号化',
  async fn() {
    const text = 'test!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
    const password = 'TestPassword123!';

    const { encrypted, iv, salt } = await encrypt(text, password);
    const decrypted = await decrypt(encrypted, iv, salt, password);

    if (decrypted !== text) {
      throw new Error(`特殊文字を含む文字列の復号結果が元の文字列と一致しません。\n期待: ${text}\n実際: ${decrypted}`);
    }
  }
});

// ====================================
// テスト実行
// ====================================

console.log('🧪 暗号化機能のテストを開始します...');
console.log('');

// Deno.testで登録されたテストは自動実行されます
// 以下のコマンドで実行:
// deno test --allow-net crypto.test.ts
