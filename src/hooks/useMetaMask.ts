/**
 * useMetaMask Hook
 *
 * MetaMaskとの連携を管理するReact Hook
 *
 * TDDフロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 *
 * 機能:
 * - MetaMask接続/切断
 * - トランザクション署名
 * - アカウント変更の検知
 * - 現在のアドレス取得
 */

import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';

// MetaMask Ethereum Provider の型定義
interface MetaMaskEthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

// window.ethereum の型定義拡張
declare global {
  interface Window {
    ethereum?: MetaMaskEthereumProvider;
  }
}

export interface UseMetaMaskReturn {
  account: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<string>;
  disconnect: () => void;
  signTransaction: (unsignedTx: ethers.TransactionRequest) => Promise<string>;
  getCurrentAddress: () => Promise<string | null>;
}

/**
 * MetaMask連携Hook
 *
 * @returns MetaMask連携の状態と操作関数
 *
 * @example
 * ```tsx
 * const { connect, signTransaction, account, isConnected } = useMetaMask();
 *
 * // 接続
 * await connect();
 *
 * // 署名
 * const signedTx = await signTransaction(unsignedTx);
 * ```
 */
export function useMetaMask(): UseMetaMaskReturn {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  /**
   * MetaMaskに接続
   *
   * @returns 接続されたアカウントアドレス
   * @throws Error MetaMaskがインストールされていない場合
   */
  const connect = useCallback(async (): Promise<string> => {
    if (!window.ethereum) {
      throw new Error('MetaMask not installed');
    }

    setIsConnecting(true);

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      const connectedAccount = accounts[0];
      setAccount(connectedAccount);
      setIsConnected(true);

      return connectedAccount;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  /**
   * MetaMaskから切断（状態をリセット）
   */
  const disconnect = useCallback(() => {
    setAccount(null);
    setIsConnected(false);
  }, []);

  /**
   * トランザクションに署名
   *
   * @param unsignedTx - 未署名トランザクション
   * @returns 署名済みトランザクションハッシュ
   * @throws Error MetaMaskが接続されていない場合
   */
  const signTransaction = useCallback(async (unsignedTx: ethers.TransactionRequest): Promise<string> => {
    if (!window.ethereum) {
      throw new Error('MetaMask not connected');
    }

    // eth_sendTransactionを使って署名と送信を行う
    const txHash = (await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [unsignedTx],
    })) as string;

    return txHash;
  }, []);

  /**
   * 現在のアドレスを取得
   *
   * @returns 現在のアドレス、またはnull
   */
  const getCurrentAddress = useCallback(async (): Promise<string | null> => {
    if (!window.ethereum) {
      return null;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_accounts',
      })) as string[];

      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      return null;
    }
  }, []);

  /**
   * アカウント変更の検知
   */
  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // ユーザーがMetaMaskからログアウト
        disconnect();
      } else if (accounts[0] !== account) {
        // アカウントが変更された
        setAccount(accounts[0]);
        setIsConnected(true);
      }
    };

    // イベントリスナー登録
    window.ethereum.on?.('accountsChanged', handleAccountsChanged);

    // クリーンアップ
    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, [account, disconnect]);

  return {
    account,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    signTransaction,
    getCurrentAddress,
  };
}
