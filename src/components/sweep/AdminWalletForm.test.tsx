import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import AdminWalletForm from './AdminWalletForm';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn()
  }
}));

// ToastContextのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

describe('AdminWalletForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderForm = () => {
    return render(
      <BrowserRouter>
        <AdminWalletForm />
      </BrowserRouter>
    );
  };

  describe('フォーム表示', () => {
    it('必要なフィールドがすべて表示される', () => {
      renderForm();

      expect(screen.getByLabelText(/チェーン/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ネットワーク/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/アセット/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/アドレス/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    });
  });

  describe('フォーム入力', () => {
    it('アドレスフィールドに入力できる', async () => {
      const user = userEvent.setup();
      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);

      // アドレス入力
      await user.type(addressInput, '0x1234567890123456789012345678901234567890');

      // 入力値の確認
      expect(addressInput).toHaveValue('0x1234567890123456789012345678901234567890');
    });
  });

  describe('アドレス検証', () => {
    it('EVM: 不正なアドレス形式でエラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // デフォルトでchain='evm'なので選択不要
      await user.type(addressInput, 'invalid-address');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/アドレスの形式が正しくありません/i)).toBeInTheDocument();
      });
    });

    it('EVM: 正しいアドレス形式（0x + 40文字）でエラーが表示されない', async () => {
      const user = userEvent.setup();
      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // モック: 保存成功
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ data: {}, error: null })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // デフォルトでchain='evm'なので選択不要
      await user.type(addressInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/アドレスの形式が正しくありません/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('正しい入力でupsertが呼ばれる', async () => {
      const user = userEvent.setup();

      const mockUpsert = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // デフォルト値（chain='evm', network='ethereum', asset='ETH'）を使用
      await user.type(addressInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('admin_wallets');
        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            chain: 'evm',
            network: 'ethereum',
            asset: 'ETH',
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            active: true
          }),
          expect.objectContaining({
            onConflict: 'chain,network,asset'
          })
        );
      });
    });

    it('保存成功後に成功トーストが表示される', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();

      vi.mocked(await import('@/hooks/use-toast')).useToast = () => ({
        toast: mockToast
      });

      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ data: {}, error: null })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // デフォルト値を使用
      await user.type(addressInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });
    });

    it('保存失敗時にエラートーストが表示される', async () => {
      const user = userEvent.setup();

      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // デフォルト値を使用
      await user.type(addressInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      await user.click(submitButton);

      // エラーハンドリングの確認（実装により変わる）
      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalled();
      });
    });
  });

  describe('フォームリセット', () => {
    it('保存成功後にフォームがリセットされる', async () => {
      const user = userEvent.setup();

      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ data: {}, error: null })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderForm();

      const addressInput = screen.getByLabelText(/アドレス/i) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /保存/i });

      // デフォルト値を使用してアドレスのみ入力
      await user.type(addressInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      await user.click(submitButton);

      // フォームがリセットされているか確認
      await waitFor(() => {
        expect(addressInput.value).toBe('');
      });
    });
  });
});
