/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // happy-domはjsdomより軽量でメモリ効率が良い（CI OOM対策）
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // メモリ問題対策: ファイルを1つずつ順次実行
    fileParallelism: false,
    // 各テストファイルを完全に分離（メモリリーク防止）
    isolate: true,
    // forksプールを使用（threadsよりメモリ分離が良い）
    pool: 'forks',
    // Vitest 4: poolOptionsはトップレベルに移動
    forks: {
      // 各テストファイルを新しいプロセスで実行（メモリ完全解放）
      singleFork: false,
      isolate: true,
      // CI環境でのメモリ制限対策: 同時実行ワーカー数を1に制限
      maxForks: 1,
    },
    // テストタイムアウトを延長
    testTimeout: 30000,
    // テストファイルのパターン
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
    // モック設定
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
})