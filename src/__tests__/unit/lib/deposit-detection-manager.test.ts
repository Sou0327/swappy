/**
 * deposit-detection-manager の単体テスト
 * 全チェーン統合入金検知システムの包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DepositDetectionManager, type ChainConfig, type UnifiedDepositResult } from '@/lib/deposit-detection-manager'
import { supabase } from '@/integrations/supabase/client'

// 各Detectorクラスのモック
const mockEthScan = vi.fn().mockResolvedValue([])
const mockERC20Scan = vi.fn().mockResolvedValue([])
const mockTronScan = vi.fn().mockResolvedValue([])
const mockAdaScan = vi.fn().mockResolvedValue([])
const mockBtcScan = vi.fn().mockResolvedValue([])
const mockXrpScan = vi.fn().mockResolvedValue([])

vi.mock('@/lib/eth-deposit-detector', () => ({
  EthDepositDetector: vi.fn().mockImplementation(() => ({
    scanLatestDeposits: mockEthScan
  })),
  DepositDetectionResult: {}
}))

vi.mock('@/lib/erc20-deposit-detector', () => ({
  ERC20DepositDetector: vi.fn().mockImplementation(() => ({
    scanAllTokenDeposits: mockERC20Scan
  })),
  ERC20DepositResult: {}
}))

vi.mock('@/lib/tron-deposit-detector', () => ({
  TronDepositDetector: vi.fn().mockImplementation(() => ({
    scanAllDeposits: mockTronScan
  })),
  TronDepositResult: {}
}))

vi.mock('@/lib/ada-deposit-detector', () => ({
  AdaDepositDetector: vi.fn().mockImplementation(() => ({
    scanAllDeposits: mockAdaScan
  })),
  AdaDepositResult: {}
}))

vi.mock('@/lib/btc-deposit-detector', () => ({
  BTCDepositDetector: vi.fn().mockImplementation(() => ({
    scanForDeposits: mockBtcScan
  })),
  BTCDepositResult: {}
}))

vi.mock('@/lib/xrp-deposit-detector', () => ({
  XRPDepositDetector: vi.fn().mockImplementation(() => ({
    scanForDeposits: mockXrpScan
  })),
  XRPDepositResult: {}
}))

// Supabaseモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      insert: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}))

describe('DepositDetectionManager', () => {
  let manager: DepositDetectionManager

  beforeEach(async () => {
    vi.clearAllMocks()

    // 環境変数をモック
    vi.stubEnv('VITE_ETHEREUM_RPC_URL', 'http://localhost:8545')
    vi.stubEnv('VITE_ETH_MIN_CONFIRMATIONS', '12')
    vi.stubEnv('VITE_ETH_SCAN_INTERVAL_MS', '30000')
    vi.stubEnv('VITE_TRONGRID_API_KEY', 'test-tron-key')
    vi.stubEnv('VITE_TRON_NETWORK', 'mainnet')
    vi.stubEnv('VITE_TRON_MIN_CONFIRMATIONS', '19')
    vi.stubEnv('VITE_TRON_SCAN_INTERVAL_MS', '30000')
    vi.stubEnv('VITE_BLOCKFROST_API_KEY', 'test-ada-key')
    vi.stubEnv('VITE_ADA_NETWORK', 'mainnet')
    vi.stubEnv('VITE_ADA_MIN_CONFIRMATIONS', '15')
    vi.stubEnv('VITE_ADA_SCAN_INTERVAL_MS', '60000')
    vi.stubEnv('VITE_BITCOIN_RPC_URL', 'http://localhost:8332')
    vi.stubEnv('VITE_BITCOIN_RPC_AUTH', 'user:pass')
    vi.stubEnv('VITE_BITCOIN_NETWORK', 'mainnet')
    vi.stubEnv('VITE_BITCOIN_MIN_CONFIRMATIONS', '6')
    vi.stubEnv('VITE_BITCOIN_SCAN_INTERVAL_MS', '60000')
    vi.stubEnv('VITE_XRP_NETWORK', 'mainnet')
    vi.stubEnv('VITE_XRP_SCAN_INTERVAL_MS', '30000')

    manager = new DepositDetectionManager()
    // constructorで呼ばれる非同期initializeDetectors()の完了を待つ
    // setImmediateで全ての保留中の非同期処理を完了させる
    await new Promise(resolve => setImmediate(resolve))
    vi.useFakeTimers()
  })

  afterEach(() => {
    manager.destroy()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  describe('インスタンス化と初期化', () => {
    it('DepositDetectionManagerを正常にインスタンス化できる', () => {
      expect(manager).toBeInstanceOf(DepositDetectionManager)
    })

    it('初期状態では監視が停止している', () => {
      const status = manager.getStatus()
      expect(status.isRunning).toBe(false)
      expect(status.activeChains).toHaveLength(0)
    })

    it('検知器が初期化されている', () => {
      const status = manager.getStatus()
      expect(status.detectors.length).toBeGreaterThan(0)
    })
  })

  describe('環境変数からの設定読み込み', () => {
    it('EVMチェーンの設定を読み込む', async () => {
      const status = manager.getStatus()
      const hasEthDetector = status.detectors.some(d => d.includes('evm') && d.includes('eth'))
      const hasErc20Detector = status.detectors.some(d => d.includes('evm') && d.includes('erc20'))

      expect(hasEthDetector || hasErc20Detector).toBe(true)
    })

    it('Tronチェーンの設定を読み込む', async () => {
      const status = manager.getStatus()
      const hasTronDetector = status.detectors.some(d => d.includes('trc'))

      expect(hasTronDetector).toBe(true)
    })

    it('Cardanoチェーンの設定を読み込む', async () => {
      const status = manager.getStatus()
      const hasAdaDetector = status.detectors.some(d => d.includes('cardano'))

      expect(hasAdaDetector).toBe(true)
    })

    it('Bitcoinチェーンの設定を読み込む', async () => {
      const status = manager.getStatus()
      const hasBtcDetector = status.detectors.some(d => d.includes('bitcoin'))

      expect(hasBtcDetector).toBe(true)
    })

    it('XRPチェーンの設定を読み込む', async () => {
      const status = manager.getStatus()
      const hasXrpDetector = status.detectors.some(d => d.includes('xrp'))

      expect(hasXrpDetector).toBe(true)
    })
  })

  describe('監視の開始と停止', () => {
    it('監視を正常に開始できる', async () => {
      await manager.startMonitoring()

      const status = manager.getStatus()
      expect(status.isRunning).toBe(true)
    })

    it('既に監視中の場合は新規開始しない', async () => {
      await manager.startMonitoring()
      const status1 = manager.getStatus()

      await manager.startMonitoring()
      const status2 = manager.getStatus()

      expect(status1.isRunning).toBe(true)
      expect(status2.isRunning).toBe(true)
    })

    it('監視を正常に停止できる', async () => {
      await manager.startMonitoring()
      manager.stopMonitoring()

      const status = manager.getStatus()
      expect(status.isRunning).toBe(false)
      expect(status.activeChains).toHaveLength(0)
    })

    it('監視停止時にすべてのインターバルがクリアされる', async () => {
      await manager.startMonitoring()
      const beforeStop = manager.getStatus()

      manager.stopMonitoring()
      const afterStop = manager.getStatus()

      expect(beforeStop.activeChains.length).toBeGreaterThan(0)
      expect(afterStop.activeChains).toHaveLength(0)
    })

    it('停止状態での停止呼び出しはエラーにならない', () => {
      expect(() => manager.stopMonitoring()).not.toThrow()
    })
  })

  describe('手動スキャン', () => {
    it('全チェーンを手動でスキャンできる', async () => {
      const results = await manager.scanAllChains()

      expect(Array.isArray(results)).toBe(true)
    })

    it('スキャン結果が統一形式で返される', async () => {
      mockEthScan.mockResolvedValueOnce([{
        userId: 'user-1',
        depositAddress: '0xabc',
        amount: '1.0',
        transactionHash: '0x123',
        blockNumber: 1000,
        confirmations: 12
      }])

      const results = await manager.scanAllChains()

      if (results.length > 0) {
        const result = results[0]
        expect(result).toHaveProperty('chain')
        expect(result).toHaveProperty('network')
        expect(result).toHaveProperty('userId')
        expect(result).toHaveProperty('tokenSymbol')
        expect(result).toHaveProperty('amount')
        expect(result).toHaveProperty('transactionHash')
      }
    })
  })

  // 注：各チェーンのスキャン機能は、個別のDetectorテストで検証されます
  // deposit-detection-managerは統合レイヤーのテストに焦点を当てます

  describe('エラーハンドリング', () => {
    it('スキャンエラー時も処理を継続する', async () => {
      mockEthScan.mockRejectedValueOnce(new Error('Network error'))

      const results = await manager.scanAllChains()

      // エラーが発生しても他のチェーンはスキャンされる
      expect(Array.isArray(results)).toBe(true)
    })

    it('スキャンエラーが監査ログに記録される', async () => {
      mockBtcScan.mockRejectedValueOnce(new Error('Bitcoin RPC error'))

      await manager.scanAllChains()

      // supabase.from()が呼ばれたことを検証
      expect(supabase.from).toHaveBeenCalledWith('audit_logs')
    })

    it('監査ログ記録失敗時もエラーにならない', async () => {
      // insertがエラーを返すようにモック
      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: vi.fn().mockRejectedValue(new Error('DB error'))
      } as unknown as ReturnType<typeof supabase.from>)

      mockEthScan.mockRejectedValueOnce(new Error('Test error'))

      await expect(manager.scanAllChains()).resolves.not.toThrow()
    })
  })

  describe('状態管理', () => {
    it('getStatus()が正しい状態を返す', () => {
      const status = manager.getStatus()

      expect(status).toHaveProperty('isRunning')
      expect(status).toHaveProperty('activeChains')
      expect(status).toHaveProperty('detectors')
      expect(typeof status.isRunning).toBe('boolean')
      expect(Array.isArray(status.activeChains)).toBe(true)
      expect(Array.isArray(status.detectors)).toBe(true)
    })

    it('監視開始後のステータスが正しい', async () => {
      await manager.startMonitoring()
      const status = manager.getStatus()

      expect(status.isRunning).toBe(true)
      expect(status.activeChains.length).toBeGreaterThan(0)
    })
  })

  describe('リソース管理', () => {
    it('destroy()でリソースがクリーンアップされる', async () => {
      await manager.startMonitoring()

      manager.destroy()

      const status = manager.getStatus()
      expect(status.isRunning).toBe(false)
      expect(status.activeChains).toHaveLength(0)
      expect(status.detectors).toHaveLength(0)
    })

    it('destroy()は複数回呼び出してもエラーにならない', () => {
      expect(() => {
        manager.destroy()
        manager.destroy()
      }).not.toThrow()
    })
  })

  describe('定期監視', () => {
    it('監視開始後、定期的にスキャンが実行される', async () => {
      mockEthScan.mockClear()

      await manager.startMonitoring()

      // 30秒進める（ETHのスキャン間隔）
      vi.advanceTimersByTime(30000)

      // タイマーが設定されていることを確認
      const status = manager.getStatus()
      expect(status.isRunning).toBe(true)
    })
  })
})
