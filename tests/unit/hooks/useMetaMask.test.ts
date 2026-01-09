/**
 * useMetaMask Hook - Unit Test (TDD Red Phase)
 *
 * テスト対象: src/hooks/useMetaMask.ts
 *
 * TDDフロー:
 * 1. このテストを作成（Red - 失敗することを確認）
 * 2. useMetaMask.tsを実装（Green - テスト通過）
 * 3. リファクタリング（Refactor - コード改善）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// 実装ファイルからインポート（まだ存在しないのでエラーになる）
import { useMetaMask } from '../../../src/hooks/useMetaMask';

// MetaMask window.ethereumのモック型定義
interface MockEthereum {
  request: ReturnType<typeof vi.fn>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

// window型の拡張
declare global {
  interface Window {
    ethereum?: MockEthereum;
  }
}

describe('useMetaMask', () => {
  let mockEthereum: MockEthereum;

  beforeEach(() => {
    // window.ethereumのモック作成
    mockEthereum = {
      request: vi.fn(),
    };

    // window.ethereumを設定（window全体を置き換えない）
    window.ethereum = mockEthereum;
  });

  describe('初期状態', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useMetaMask());

      expect(result.current.account).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to MetaMask successfully', async () => {
      const mockAccount = '0x1234567890123456789012345678901234567890';
      mockEthereum.request.mockResolvedValueOnce([mockAccount]);

      const { result } = renderHook(() => useMetaMask());

      let returnedAccount: string | undefined;
      await act(async () => {
        returnedAccount = await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.account).toBe(mockAccount);
      expect(returnedAccount).toBe(mockAccount);
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'eth_requestAccounts',
      });
    });

    it('should set isConnecting state during connection', async () => {
      mockEthereum.request.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(['0x123']), 100);
          })
      );

      const { result } = renderHook(() => useMetaMask());

      act(() => {
        result.current.connect();
      });

      // 接続中はisConnectingがtrue
      await waitFor(() => {
        expect(result.current.isConnecting).toBe(true);
      });

      // 接続完了後はisConnectingがfalse
      await waitFor(
        () => {
          expect(result.current.isConnecting).toBe(false);
        },
        { timeout: 200 }
      );
    });

    it('should throw error if MetaMask is not installed', async () => {
      // window.ethereumを削除
      delete window.ethereum;

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.connect();
        })
      ).rejects.toThrow('MetaMask not installed');
    });

    it('should handle connection rejection', async () => {
      mockEthereum.request.mockRejectedValueOnce(
        new Error('User rejected the request')
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.connect();
        })
      ).rejects.toThrow('User rejected the request');

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe('signTransaction', () => {
    it('should sign transaction successfully', async () => {
      const mockAccount = '0x1234567890123456789012345678901234567890';
      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const unsignedTx = {
        from: mockAccount,
        to: '0xabcd...',
        value: '0x1',
        gasPrice: '0x2',
        gas: '0x5208',
        nonce: '0x0',
      };

      // eth_requestAccounts, eth_sendTransactionのモック
      mockEthereum.request
        .mockResolvedValueOnce([mockAccount]) // connect: eth_requestAccounts
        .mockResolvedValueOnce(mockTxHash); // signTransaction: eth_sendTransaction

      const { result } = renderHook(() => useMetaMask());

      // 最初に接続
      await act(async () => {
        await result.current.connect();
      });

      let txHash: string | undefined;
      await act(async () => {
        txHash = await result.current.signTransaction(unsignedTx);
      });

      expect(txHash).toBe(mockTxHash);
    });

    it('should throw error if MetaMask is not connected', async () => {
      // window.ethereumを削除
      delete window.ethereum;

      const { result } = renderHook(() => useMetaMask());

      const unsignedTx = {
        from: '0x123',
        to: '0xabc',
        value: '0x1',
      };

      await expect(
        act(async () => {
          await result.current.signTransaction(unsignedTx);
        })
      ).rejects.toThrow('MetaMask not connected');
    });
  });

  describe('getCurrentAddress', () => {
    it('should get current address from MetaMask', async () => {
      const mockAccount = '0x1234567890123456789012345678901234567890';

      mockEthereum.request
        .mockResolvedValueOnce([mockAccount]) // connect: eth_requestAccounts
        .mockResolvedValueOnce([mockAccount]); // getCurrentAddress: eth_accounts

      const { result } = renderHook(() => useMetaMask());

      // 最初に接続
      await act(async () => {
        await result.current.connect();
      });

      let address: string | null = null;
      await act(async () => {
        address = await result.current.getCurrentAddress();
      });

      expect(address).toBe(mockAccount);
    });

    it('should return null if MetaMask is not available', async () => {
      // window.ethereumを削除
      delete window.ethereum;

      const { result } = renderHook(() => useMetaMask());

      let address: string | null = null;
      await act(async () => {
        address = await result.current.getCurrentAddress();
      });

      expect(address).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should disconnect and reset state', async () => {
      const mockAccount = '0x1234567890123456789012345678901234567890';
      mockEthereum.request.mockResolvedValueOnce([mockAccount]);

      const { result } = renderHook(() => useMetaMask());

      // 接続
      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.account).toBe(mockAccount);

      // 切断
      await act(async () => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.account).toBeNull();
    });
  });

  describe('アカウント変更の検知', () => {
    it('should update account when MetaMask account changes', async () => {
      const mockAccount1 = '0x1111111111111111111111111111111111111111';
      const mockAccount2 = '0x2222222222222222222222222222222222222222';

      let accountsChangedHandler: (accounts: string[]) => void = () => {};

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'accountsChanged') {
          accountsChangedHandler = handler;
        }
      });

      mockEthereum.request.mockResolvedValueOnce([mockAccount1]);

      const { result } = renderHook(() => useMetaMask());

      // 初回接続
      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.account).toBe(mockAccount1);

      // アカウント変更イベント発火
      await act(async () => {
        accountsChangedHandler([mockAccount2]);
      });

      expect(result.current.account).toBe(mockAccount2);
    });
  });
});
