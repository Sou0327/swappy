import { vi } from 'vitest'

/**
 * XRPL (XRP Ledger) モック
 * ウォレット生成、トランザクション処理のモック
 */

// XRPアドレスモック
export const mockXrplWallet = {
  address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
  publicKey: '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020',
  privateKey: '00D78B9735C3F26501C7337B8A5727FD53A6EFDBC6AA55984F098488561F985E23',
  seed: 'sn3nxiW7v8KXzPzAqzyHXbSSKNuN9',
  classicAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'
}

// トランザクションレスポンスモック
export const mockXrplPaymentTx = {
  id: 1,
  result: {
    Account: mockXrplWallet.address,
    Amount: '100000000', // 100 XRP in drops
    Destination: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
    DestinationTag: 12345,
    Fee: '12',
    Flags: 2147483648,
    LastLedgerSequence: 7835923,
    Sequence: 2,
    SigningPubKey: mockXrplWallet.publicKey,
    TransactionType: 'Payment',
    TxnSignature: '3045022100...',
    date: 609123456,
    hash: 'E3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8D2A8D2A8D',
    inLedger: 7835920,
    ledger_index: 7835920,
    meta: {
      TransactionIndex: 0,
      TransactionResult: 'tesSUCCESS',
      delivered_amount: '100000000'
    },
    validated: true
  },
  type: 'response',
  status: 'success'
}

// アカウント情報モック
export const mockXrplAccountInfo = {
  id: 1,
  result: {
    account_data: {
      Account: mockXrplWallet.address,
      Balance: '1000000000', // 1000 XRP in drops
      Flags: 0,
      LedgerEntryType: 'AccountRoot',
      OwnerCount: 0,
      PreviousTxnID: 'E3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8D2A8D2A8D',
      PreviousTxnLgrSeq: 7835920,
      Sequence: 3,
      index: 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6A7B8C9D0'
    },
    ledger_current_index: 7835923,
    validated: true
  },
  type: 'response',
  status: 'success'
}

// レジャー情報モック
export const mockXrplLedger = {
  id: 1,
  result: {
    ledger: {
      accepted: true,
      account_hash: '...',
      close_flags: 0,
      close_time: 609123456,
      close_time_human: '2019-Mar-28 00:00:00.000000000 UTC',
      close_time_resolution: 10,
      closed: true,
      ledger_hash: 'E3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8D2A8D2A8D',
      ledger_index: '7835920',
      parent_close_time: 609123450,
      parent_hash: 'D2A8D2A8DE3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8',
      total_coins: '99991429038368605',
      transaction_hash: 'C1B2A3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6A7B8C9D0'
    },
    ledger_hash: 'E3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8D2A8D2A8D',
    ledger_index: 7835920,
    validated: true
  },
  type: 'response',
  status: 'success'
}

// XRPLクライアントモック
export class MockXrplClient {
  connected = false

  async connect() {
    this.connected = true
    return Promise.resolve()
  }

  async disconnect() {
    this.connected = false
    return Promise.resolve()
  }

  async request(req: { command: string; [key: string]: unknown }) {
    switch (req.command) {
      case 'account_info':
        return mockXrplAccountInfo
      case 'tx':
        return mockXrplPaymentTx
      case 'ledger':
        return mockXrplLedger
      case 'submit':
        return {
          ...mockXrplPaymentTx,
          result: {
            ...mockXrplPaymentTx.result,
            engine_result: 'tesSUCCESS',
            engine_result_message: 'The transaction was applied. Only final in a validated ledger.'
          }
        }
      default:
        return { result: {}, type: 'response', status: 'success' }
    }
  }

  async submitAndWait(tx: Record<string, unknown>) {
    return mockXrplPaymentTx
  }

  async autofill(tx: Record<string, unknown>) {
    return {
      ...tx,
      Fee: '12',
      Sequence: 2,
      LastLedgerSequence: 7835923
    }
  }
}

// Walletクラスモック
export class MockXrplWallet {
  static generate = vi.fn(() => mockXrplWallet)
  static fromSeed = vi.fn((_seed: string) => mockXrplWallet)
  static fromSecret = vi.fn((_secret: string) => mockXrplWallet)

  address = mockXrplWallet.address
  publicKey = mockXrplWallet.publicKey
  privateKey = mockXrplWallet.privateKey
  seed = mockXrplWallet.seed

  sign(_tx: Record<string, unknown>) {
    return {
      tx_blob: 'SIGNED_TX_BLOB',
      hash: 'E3FE6EA3D48F0C2B639448559B2580D6F7AC9A0F2F63B43A2C2B6A8D2A8D2A8D'
    }
  }
}

// グローバルモック設定
export const setupXrplMock = () => {
  vi.mock('xrpl', () => ({
    Client: MockXrplClient,
    Wallet: MockXrplWallet,
    dropsToXrp: vi.fn((drops: string) => (parseInt(drops) / 1000000).toString()),
    xrpToDrops: vi.fn((xrp: string) => (parseFloat(xrp) * 1000000).toString()),
    validate: vi.fn(() => true),
    decodeAccountID: vi.fn((address: string) => address),
    encodeAccountID: vi.fn((_buffer: unknown) => mockXrplWallet.address)
  }))
}
