import { BitcoinHDWallet } from './wallets/btc-wallet';
import { XRPWalletManager } from './wallets/xrp-wallet';
import { UTXOManager } from './utxo-manager';
import { analyzeBTCAddress, BTCAddressTester } from './btc-address-validator';
import { generateEVMAddress } from './evm-wallet-utils';
import { generateMultichainAddress } from './multichain-wallet-utils';
import { AuditLogger, AuditAction } from './security/audit-logger';

/**
 * ウォレット統合テスト結果
 */
export interface WalletTestResult {
  walletType: string;
  network: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * 包括的ウォレット統合テスト結果
 */
export interface IntegrationTestSuite {
  timestamp: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: WalletTestResult[];
  summary: {
    bitcoin: boolean;
    xrp: boolean;
    ethereum: boolean;
    tron: boolean;
    cardano: boolean;
    addressValidation: boolean;
    utxoManagement: boolean;
    auditLogging: boolean;
  };
}

/**
 * ウォレットシステム統合テストマネージャー
 */
export class WalletIntegrationTester {
  private testUserId: string = 'test-user-integration';
  private results: WalletTestResult[] = [];

  constructor() {
    // テスト用ユーザーIDを生成
    this.testUserId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 全ウォレットシステムの統合テスト実行
   */
  async runCompleteIntegrationTest(): Promise<IntegrationTestSuite> {
    this.results = [];
    const startTime = Date.now();

    // 各ウォレットシステムのテスト
    await this.testBitcoinWalletSystem();
    await this.testXRPWalletSystem();
    await this.testEthereumWalletSystem();
    await this.testTronWalletSystem();
    await this.testCardanoWalletSystem();
    
    // 共通機能のテスト
    await this.testAddressValidationSystem();
    await this.testUTXOManagementSystem();
    await this.testAuditLoggingSystem();

    // 結果集計
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;

    const summary = {
      bitcoin: this.results.filter(r => r.walletType === 'bitcoin' && r.success).length > 0,
      xrp: this.results.filter(r => r.walletType === 'xrp' && r.success).length > 0,
      ethereum: this.results.filter(r => r.walletType === 'ethereum' && r.success).length > 0,
      tron: this.results.filter(r => r.walletType === 'tron' && r.success).length > 0,
      cardano: this.results.filter(r => r.walletType === 'cardano' && r.success).length > 0,
      addressValidation: this.results.filter(r => r.walletType === 'address-validation' && r.success).length > 0,
      utxoManagement: this.results.filter(r => r.walletType === 'utxo-management' && r.success).length > 0,
      auditLogging: this.results.filter(r => r.walletType === 'audit-logging' && r.success).length > 0
    };

    return {
      timestamp: startTime,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      results: this.results,
      summary
    };
  }

  /**
   * Bitcoinウォレットシステムテスト
   */
  private async testBitcoinWalletSystem(): Promise<void> {
    // HD Wallet生成テスト
    try {
      const keyPair = await BitcoinHDWallet.generateHDWalletKeyPair(
        this.testUserId,
        'testnet',
        'P2WPKH',
        0,
        1
      );

      this.results.push({
        walletType: 'bitcoin',
        network: 'testnet',
        success: true,
        message: 'Bitcoin HD Wallet生成成功',
        details: {
          address: keyPair.address,
          addressType: keyPair.addressType,
          derivationPath: keyPair.derivationPath
        }
      });

      // アドレス妥当性チェック
      const isValid = BitcoinHDWallet.validateAddress(keyPair.address, 'testnet');
      this.results.push({
        walletType: 'bitcoin',
        network: 'testnet',
        success: isValid,
        message: isValid ? 'Bitcoin アドレス検証成功' : 'Bitcoin アドレス検証失敗',
        details: { address: keyPair.address, valid: isValid }
      });

    } catch (error) {
      this.results.push({
        walletType: 'bitcoin',
        network: 'testnet',
        success: false,
        message: 'Bitcoin HD Wallet生成失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // 各アドレス形式のテスト
    const addressTypes: Array<'P2PKH' | 'P2SH' | 'P2WPKH'> = ['P2PKH', 'P2SH', 'P2WPKH'];
    
    for (const addressType of addressTypes) {
      try {
        const keyPair = await BitcoinHDWallet.generateHDWalletKeyPair(
          this.testUserId,
          'testnet',
          addressType,
          0,
          Math.floor(Math.random() * 1000)
        );

        this.results.push({
          walletType: 'bitcoin',
          network: `testnet-${addressType}`,
          success: true,
          message: `Bitcoin ${addressType} アドレス生成成功`,
          details: {
            address: keyPair.address,
            addressType: keyPair.addressType
          }
        });

      } catch (error) {
        this.results.push({
          walletType: 'bitcoin',
          network: `testnet-${addressType}`,
          success: false,
          message: `Bitcoin ${addressType} アドレス生成失敗`,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * XRPウォレットシステムテスト
   */
  private async testXRPWalletSystem(): Promise<void> {
    // XRP Wallet生成テスト
    try {
      const wallet = await XRPWalletManager.generateSecureWallet(this.testUserId, 'testnet');

      this.results.push({
        walletType: 'xrp',
        network: 'testnet',
        success: true,
        message: 'XRP ウォレット生成成功',
        details: {
          address: wallet.address,
          publicKey: wallet.publicKey
        }
      });

      // XRP アドレス妥当性チェック
      const isValid = XRPWalletManager.validateXRPAddress(wallet.address);
      this.results.push({
        walletType: 'xrp',
        network: 'testnet',
        success: isValid,
        message: isValid ? 'XRP アドレス検証成功' : 'XRP アドレス検証失敗',
        details: { address: wallet.address, valid: isValid }
      });

    } catch (error) {
      this.results.push({
        walletType: 'xrp',
        network: 'testnet',
        success: false,
        message: 'XRP ウォレット生成失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // XRP Wallet Manager接続テスト
    try {
      const manager = new XRPWalletManager('testnet');
      const healthCheck = await manager.healthCheck();

      this.results.push({
        walletType: 'xrp',
        network: 'testnet',
        success: healthCheck.connected,
        message: healthCheck.connected ? 'XRP ネットワーク接続成功' : 'XRP ネットワーク接続失敗',
        details: healthCheck
      });

      await manager.disconnect();

    } catch (error) {
      this.results.push({
        walletType: 'xrp',
        network: 'testnet',
        success: false,
        message: 'XRP ネットワーク接続テスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Ethereumウォレットシステムテスト
   */
  private async testEthereumWalletSystem(): Promise<void> {
    try {
      // ETH アドレス生成テスト
      const ethWallet = generateEVMAddress(this.testUserId, 'sepolia', 'ETH');
      
      this.results.push({
        walletType: 'ethereum',
        network: 'sepolia',
        success: true,
        message: 'Ethereum ウォレット生成成功',
        details: {
          address: ethWallet.address,
          derivationPath: ethWallet.derivationPath
        }
      });

      // USDT アドレス生成テスト
      const usdtWallet = generateEVMAddress(this.testUserId, 'sepolia', 'USDT');
      
      this.results.push({
        walletType: 'ethereum',
        network: 'sepolia-usdt',
        success: true,
        message: 'Ethereum USDT ウォレット生成成功',
        details: {
          address: usdtWallet.address,
          derivationPath: usdtWallet.derivationPath
        }
      });

    } catch (error) {
      this.results.push({
        walletType: 'ethereum',
        network: 'sepolia',
        success: false,
        message: 'Ethereum ウォレット生成失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * TRONウォレットシステムテスト
   */
  private async testTronWalletSystem(): Promise<void> {
    try {
      // TRX アドレス生成テスト
      const tronWallet = generateMultichainAddress(this.testUserId, 'trc', 'shasta', 'TRX');
      
      this.results.push({
        walletType: 'tron',
        network: 'shasta',
        success: true,
        message: 'TRON ウォレット生成成功',
        details: {
          address: tronWallet.address,
          derivationPath: tronWallet.derivationPath
        }
      });

    } catch (error) {
      this.results.push({
        walletType: 'tron',
        network: 'shasta',
        success: false,
        message: 'TRON ウォレットテスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Cardanoウォレットシステムテスト
   */
  private async testCardanoWalletSystem(): Promise<void> {
    try {
      // ADA アドレス生成テスト
      const cardanoWallet = generateMultichainAddress(this.testUserId, 'ada', 'testnet', 'ADA');
      
      this.results.push({
        walletType: 'cardano',
        network: 'testnet',
        success: true,
        message: 'Cardano ウォレット生成成功',
        details: {
          address: cardanoWallet.address,
          derivationPath: cardanoWallet.derivationPath
        }
      });

    } catch (error) {
      this.results.push({
        walletType: 'cardano',
        network: 'testnet',
        success: false,
        message: 'Cardano ウォレットテスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * アドレス検証システムテスト
   */
  private async testAddressValidationSystem(): Promise<void> {
    try {
      // Bitcoin アドレス形式テスト
      const btcTestResults = BTCAddressTester.testAllFormats();
      const btcTestPassed = Object.values(btcTestResults).every(result => result);

      this.results.push({
        walletType: 'address-validation',
        network: 'bitcoin',
        success: btcTestPassed,
        message: btcTestPassed ? 'Bitcoin アドレス検証テスト成功' : 'Bitcoin アドレス検証テスト失敗',
        details: btcTestResults
      });

      // 無効アドレステスト
      const invalidTestResults = BTCAddressTester.testInvalidAddresses();
      const invalidTestPassed = Object.values(invalidTestResults).every(result => result);

      this.results.push({
        walletType: 'address-validation',
        network: 'bitcoin-invalid',
        success: invalidTestPassed,
        message: invalidTestPassed ? 'Bitcoin 無効アドレステスト成功' : 'Bitcoin 無効アドレステスト失敗',
        details: invalidTestResults
      });

      // パフォーマンステスト
      const perfTime = BTCAddressTester.performanceTest(100);
      const perfPassed = perfTime < 1000; // 1秒以内

      this.results.push({
        walletType: 'address-validation',
        network: 'bitcoin-performance',
        success: perfPassed,
        message: perfPassed ? 'Bitcoin アドレス検証パフォーマンステスト成功' : 'Bitcoin アドレス検証パフォーマンステスト失敗',
        details: { timeMs: perfTime, iterations: 100 }
      });

    } catch (error) {
      this.results.push({
        walletType: 'address-validation',
        network: 'bitcoin',
        success: false,
        message: 'アドレス検証システムテスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * UTXO管理システムテスト
   */
  private async testUTXOManagementSystem(): Promise<void> {
    try {
      const utxoManager = new UTXOManager('testnet');

      // テスト用UTXO追加
      const testUTXO = {
        txid: 'test_txid_' + Date.now(),
        vout: 0,
        amount: 100000, // 0.001 BTC
        scriptPubKey: 'test_script',
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        confirmations: 6,
        spent: false
      };

      await utxoManager.addUTXO(testUTXO, this.testUserId);

      // 残高確認
      const balance = utxoManager.getTotalBalance();
      const balanceTest = balance === 100000;

      this.results.push({
        walletType: 'utxo-management',
        network: 'testnet',
        success: balanceTest,
        message: balanceTest ? 'UTXO残高管理テスト成功' : 'UTXO残高管理テスト失敗',
        details: { expectedBalance: 100000, actualBalance: balance }
      });

      // UTXO選択テスト
      const selectedUTXOs = utxoManager.selectUTXOs(50000); // 0.0005 BTC
      const selectionTest = selectedUTXOs.length > 0;

      this.results.push({
        walletType: 'utxo-management',
        network: 'testnet-selection',
        success: selectionTest,
        message: selectionTest ? 'UTXO選択テスト成功' : 'UTXO選択テスト失敗',
        details: { 
          targetAmount: 50000, 
          selectedCount: selectedUTXOs.length,
          selectedAmount: selectedUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0)
        }
      });

      // トランザクション構築テスト
      const tx = await utxoManager.constructTransaction(
        [{ address: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sL5k7', amount: 30000 }],
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      );

      const txTest = tx.inputs.length > 0 && tx.outputs.length > 0;

      this.results.push({
        walletType: 'utxo-management',
        network: 'testnet-transaction',
        success: txTest,
        message: txTest ? 'UTXO トランザクション構築テスト成功' : 'UTXO トランザクション構築テスト失敗',
        details: {
          inputCount: tx.inputs.length,
          outputCount: tx.outputs.length,
          fee: tx.fee,
          totalInput: tx.totalInput,
          totalOutput: tx.totalOutput
        }
      });

      // 統計情報テスト
      const stats = utxoManager.getUTXOStatistics();
      const statsTest = stats.total > 0 && stats.available > 0;

      this.results.push({
        walletType: 'utxo-management',
        network: 'testnet-statistics',
        success: statsTest,
        message: statsTest ? 'UTXO統計情報テスト成功' : 'UTXO統計情報テスト失敗',
        details: stats
      });

    } catch (error) {
      this.results.push({
        walletType: 'utxo-management',
        network: 'testnet',
        success: false,
        message: 'UTXO管理システムテスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 監査ログシステムテスト
   */
  private async testAuditLoggingSystem(): Promise<void> {
    try {
      // テスト用監査ログ記録
      const logEntry = await AuditLogger.log(
        AuditAction.WALLET_CREATE,
        'integration-test',
        {
          testType: 'wallet-integration',
          timestamp: Date.now(),
          userId: this.testUserId
        },
        { userId: this.testUserId, riskLevel: 'low' }
      );

      const logTest = logEntry.id !== undefined;

      this.results.push({
        walletType: 'audit-logging',
        network: 'system',
        success: logTest,
        message: logTest ? '監査ログ記録テスト成功' : '監査ログ記録テスト失敗',
        details: {
          logId: logEntry.id,
          action: logEntry.action,
          resource: logEntry.resource
        }
      });

      // ログ整合性テスト
      const integrityCheck = AuditLogger.verifyLogIntegrity();
      const integrityTest = integrityCheck.valid;

      this.results.push({
        walletType: 'audit-logging',
        network: 'system-integrity',
        success: integrityTest,
        message: integrityTest ? '監査ログ整合性テスト成功' : '監査ログ整合性テスト失敗',
        details: {
          valid: integrityCheck.valid,
          corruptedEntries: integrityCheck.corruptedEntries.length
        }
      });

    } catch (error) {
      this.results.push({
        walletType: 'audit-logging',
        network: 'system',
        success: false,
        message: '監査ログシステムテスト失敗',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 個別ウォレットシステムテスト
   */
  async testSpecificWallet(walletType: string, network: string): Promise<WalletTestResult[]> {
    const previousResults = this.results.length;

    switch (walletType.toLowerCase()) {
      case 'bitcoin':
        await this.testBitcoinWalletSystem();
        break;
      case 'xrp':
        await this.testXRPWalletSystem();
        break;
      case 'ethereum':
        await this.testEthereumWalletSystem();
        break;
      case 'tron':
        await this.testTronWalletSystem();
        break;
      case 'cardano':
        await this.testCardanoWalletSystem();
        break;
      default:
        throw new Error(`サポートされていないウォレットタイプ: ${walletType}`);
    }

    return this.results.slice(previousResults);
  }

  /**
   * テスト結果のHTMLレポート生成
   */
  generateHTMLReport(testSuite: IntegrationTestSuite): string {
    const successRate = (testSuite.passedTests / testSuite.totalTests * 100).toFixed(1);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>ウォレット統合テストレポート</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .test-result { margin: 10px 0; padding: 10px; border-left: 3px solid #ddd; }
        .test-result.success { border-left-color: #28a745; }
        .test-result.failure { border-left-color: #dc3545; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0; }
        .summary-item { padding: 10px; text-align: center; border-radius: 5px; }
        .summary-item.success { background: #d4edda; }
        .summary-item.failure { background: #f8d7da; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ウォレット統合テストレポート</h1>
        <p>実行日時: ${new Date(testSuite.timestamp).toLocaleString()}</p>
        <p>成功率: <span class="${successRate === '100.0' ? 'success' : 'failure'}">${successRate}%</span> (${testSuite.passedTests}/${testSuite.totalTests})</p>
    </div>

    <div class="summary">
        <div class="summary-item ${testSuite.summary.bitcoin ? 'success' : 'failure'}">
            <h3>Bitcoin</h3>
            <p>${testSuite.summary.bitcoin ? '✅ 成功' : '❌ 失敗'}</p>
        </div>
        <div class="summary-item ${testSuite.summary.xrp ? 'success' : 'failure'}">
            <h3>XRP</h3>
            <p>${testSuite.summary.xrp ? '✅ 成功' : '❌ 失敗'}</p>
        </div>
        <div class="summary-item ${testSuite.summary.ethereum ? 'success' : 'failure'}">
            <h3>Ethereum</h3>
            <p>${testSuite.summary.ethereum ? '✅ 成功' : '❌ 失敗'}</p>
        </div>
        <div class="summary-item ${testSuite.summary.tron ? 'success' : 'failure'}">
            <h3>TRON</h3>
            <p>${testSuite.summary.tron ? '✅ 成功' : '❌ 失敗'}</p>
        </div>
    </div>

    <h2>詳細テスト結果</h2>
    ${testSuite.results.map(result => `
        <div class="test-result ${result.success ? 'success' : 'failure'}">
            <h3>${result.success ? '✅' : '❌'} ${result.walletType} (${result.network})</h3>
            <p><strong>メッセージ:</strong> ${result.message}</p>
            ${result.details ? `<p><strong>詳細:</strong> <code>${JSON.stringify(result.details, null, 2)}</code></p>` : ''}
            ${result.error ? `<p><strong>エラー:</strong> <code>${result.error}</code></p>` : ''}
        </div>
    `).join('')}
</body>
</html>`;
  }

  /**
   * テスト結果をJSON形式でエクスポート
   */
  exportTestResults(testSuite: IntegrationTestSuite): string {
    return JSON.stringify(testSuite, null, 2);
  }
}