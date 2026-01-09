import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const {
  BASE_URL = 'http://localhost:8080',
  LOGIN_PATH = '/auth',
  EMAIL,
  PASSWORD,
} = process.env;

const OUT_DIR = path.join(process.cwd(), 'out', 'screenshots');
const AUTH_DIR = path.join(process.cwd(), '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'state.json');

// デスクトップとモバイルのみ（ポートフォリオ用）
const BREAKPOINTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile',  width: 390,  height: 844 }
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function loginIfNeeded(browser) {
  if (!EMAIL || !PASSWORD) {
    console.log('⚠️  EMAIL/PASSWORD が設定されていません。ログインをスキップします。');
    return false;
  }

  console.log('🔐 ログイン処理を開始します...');
  ensureDir(AUTH_DIR);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const loginUrl = new URL(LOGIN_PATH, BASE_URL).toString();
    console.log(`   → ${loginUrl} にアクセス中...`);
    await page.goto(loginUrl, { waitUntil: 'networkidle' });

    // Supabase認証フォームのセレクタ（Auth.tsx参照）
    // ログインタブがアクティブであることを確認
    const signinTab = await page.$('button[value="signin"]');
    if (signinTab) {
      await signinTab.click();
      await page.waitForTimeout(500);
    }

    // メールアドレス入力
    console.log(`   → メールアドレスを入力: ${EMAIL}`);
    await page.fill('input#email', EMAIL);

    // パスワード入力
    console.log(`   → パスワードを入力`);
    await page.fill('input#password', PASSWORD);

    // ログインボタンをクリック
    console.log(`   → ログインボタンをクリック`);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.click('button[type="submit"]:has-text("ログイン")')
    ]);

    // ログイン成功を確認（/redirectにリダイレクトされる）
    await page.waitForTimeout(2000);

    // 認証状態を保存
    await context.storageState({ path: STATE_PATH });
    console.log('✅ ログイン成功！認証状態を保存しました。\n');

    await context.close();
    return true;
  } catch (error) {
    console.error('❌ ログイン処理でエラーが発生しました:', error.message);
    await context.close();
    throw error;
  }
}

async function captureAll() {
  ensureDir(OUT_DIR);
  const routes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'routes.json'), 'utf-8'));

  console.log('📸 スクリーンショット撮影を開始します...');
  console.log(`   対象ルート数: ${routes.length}`);
  console.log(`   デバイスサイズ: ${BREAKPOINTS.map(bp => bp.label).join(', ')}\n`);

  const browser = await chromium.launch();

  // 認証
  await loginIfNeeded(browser);

  let totalCaptured = 0;

  for (const bp of BREAKPOINTS) {
    console.log(`\n📱 ${bp.label} (${bp.width}x${bp.height}) での撮影を開始...`);

    const context = await browser.newContext({
      viewport: { width: bp.width, height: bp.height },
      ...(fs.existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {})
    });
    const page = await context.newPage();

    for (const route of routes) {
      const url = new URL(route, BASE_URL).toString();

      try {
        console.log(`   → ${route}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // SPAで遅延レンダリングがある場合の待ち
        await page.waitForTimeout(1000);

        // ファイル名生成： root_desktop.png のように整形
        const safe = route.replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || 'root';
        const file = path.join(OUT_DIR, `${safe}_${bp.label}.png`);

        await page.screenshot({ path: file, fullPage: true });
        totalCaptured++;
      } catch (error) {
        console.error(`   ❌ エラー: ${route} - ${error.message}`);
      }
    }
    await context.close();
  }

  await browser.close();

  console.log(`\n✅ 撮影完了！ ${totalCaptured} 枚のスクリーンショットを保存しました。`);
  console.log(`   保存先: ${OUT_DIR}\n`);
}

captureAll().catch((e) => {
  console.error('❌ 致命的なエラーが発生しました:', e);
  process.exit(1);
});
