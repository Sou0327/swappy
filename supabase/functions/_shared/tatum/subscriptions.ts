/**
 * Tatum API Subscription Management - Deno Native Implementation
 *
 * 型安全なサブスクリプション管理システム
 * CRUD操作とバリデーション機能完全実装
 */

import type {
  SubscriptionType,
  SubscriptionAttributes,
  CreateSubscriptionRequest,
  SubscriptionResponse,
  SubscriptionListResponse,
  TatumApiResponse,
  SupportedChain,
  UndefinedChain,
  UndefinedNetwork,
  UndefinedAsset
} from './types.ts';

import { TatumClient } from './client.ts';
import {
  TatumSubscriptionError,
  TatumSubscriptionNotFoundError,
  TatumValidationError,
  TatumErrorFactory
} from './errors.ts';
import { logger } from './logger.ts';
import { ValidationUtils, TimeUtils } from './utils.ts';
import { TatumConfig } from './config.ts';

// ====================================
// Subscription Manager
// ====================================

export class TatumSubscriptionManager {
  private client: TatumClient;
  private baseEndpoint = '/subscription';

  constructor(client: TatumClient) {
    this.client = client;
  }

  /**
   * サブスクリプション作成
   */
  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<TatumApiResponse<SubscriptionResponse>> {
    logger.info('Creating subscription', {
      type: request.type,
      chain: request.attr.chain,
      address: request.attr.address
    });

    // Validation
    this.validateCreateRequest(request);

    try {
      const response = await this.client.post<SubscriptionResponse>(
        this.baseEndpoint,
        request
      );

      if (response.success) {
        logger.logSubscriptionCreated(
          response.data.id,
          request.type,
          {
            chain: request.attr.chain,
            address: request.attr.address,
            url: request.attr.url
          }
        );
      }

      return response;

    } catch (error) {
      logger.error('Failed to create subscription', error as Error, {
        type: request.type,
        chain: request.attr.chain,
        address: request.attr.address
      });
      throw error;
    }
  }

  /**
   * サブスクリプション一覧取得
   */
  async listSubscriptions(
    options: {
      pageNumber?: number;
      pageSize?: number;
      type?: SubscriptionType;
      chain?: SupportedChain;
      active?: boolean;
    } = {}
  ): Promise<TatumApiResponse<SubscriptionListResponse>> {
    logger.info('Listing subscriptions', options);

    const params: Record<string, string | number | boolean> = {};

    if (options.pageNumber !== undefined) {
      params.pageNumber = options.pageNumber;
    }

    if (options.pageSize !== undefined) {
      params.pageSize = Math.min(options.pageSize, 100); // Max 100 per page
    }

    if (options.type) {
      params.type = options.type;
    }

    if (options.chain) {
      params.chain = options.chain;
    }

    if (options.active !== undefined) {
      params.active = options.active;
    }

    try {
      const response = await this.client.get<SubscriptionListResponse>(
        this.baseEndpoint,
        params
      );

      if (response.success) {
        logger.info('Subscriptions retrieved', {
          count: response.data.data.length,
          pagination: response.data.pagination
        });
      }

      return response;

    } catch (error) {
      logger.error('Failed to list subscriptions', error as Error, options);
      throw error;
    }
  }

  /**
   * サブスクリプション詳細取得
   */
  async getSubscription(
    subscriptionId: string
  ): Promise<TatumApiResponse<SubscriptionResponse>> {
    if (!subscriptionId) {
      throw TatumErrorFactory.createValidationError(
        'Subscription ID is required',
        'subscriptionId',
        subscriptionId
      );
    }

    logger.info('Getting subscription', { subscriptionId });

    try {
      const response = await this.client.get<SubscriptionResponse>(
        `${this.baseEndpoint}/${subscriptionId}`
      );

      if (response.success) {
        logger.info('Subscription retrieved', {
          subscriptionId,
          type: response.data.type,
          active: response.data.active
        });
      }

      return response;

    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        throw new TatumSubscriptionNotFoundError(subscriptionId);
      }

      logger.error('Failed to get subscription', error as Error, { subscriptionId });
      throw error;
    }
  }

  /**
   * サブスクリプション更新
   */
  async updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<SubscriptionResponse, 'active'> & { attr: Partial<SubscriptionAttributes> }>
  ): Promise<TatumApiResponse<SubscriptionResponse>> {
    if (!subscriptionId) {
      throw TatumErrorFactory.createValidationError(
        'Subscription ID is required',
        'subscriptionId',
        subscriptionId
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw TatumErrorFactory.createValidationError(
        'At least one field must be updated',
        'updates',
        updates
      );
    }

    logger.info('Updating subscription', { subscriptionId, updates });

    try {
      const response = await this.client.put<SubscriptionResponse>(
        `${this.baseEndpoint}/${subscriptionId}`,
        updates
      );

      if (response.success) {
        logger.info('Subscription updated', {
          subscriptionId,
          active: response.data.active
        });
      }

      return response;

    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        throw new TatumSubscriptionNotFoundError(subscriptionId);
      }

      logger.error('Failed to update subscription', error as Error, {
        subscriptionId,
        updates
      });
      throw error;
    }
  }

  /**
   * サブスクリプション削除
   */
  async deleteSubscription(
    subscriptionId: string
  ): Promise<TatumApiResponse<{ deleted: boolean; id: string }>> {
    if (!subscriptionId) {
      throw TatumErrorFactory.createValidationError(
        'Subscription ID is required',
        'subscriptionId',
        subscriptionId
      );
    }

    logger.info('Deleting subscription', { subscriptionId });

    try {
      const response = await this.client.delete<{ deleted: boolean; id: string }>(
        `${this.baseEndpoint}/${subscriptionId}`
      );

      if (response.success) {
        logger.logSubscriptionDeleted(subscriptionId);
      }

      return response;

    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        throw new TatumSubscriptionNotFoundError(subscriptionId);
      }

      logger.error('Failed to delete subscription', error as Error, { subscriptionId });
      throw error;
    }
  }

  /**
   * サブスクリプション一括作成
   */
  async createBatchSubscriptions(
    requests: CreateSubscriptionRequest[]
  ): Promise<{
    successful: Array<{ request: CreateSubscriptionRequest; response: SubscriptionResponse }>;
    failed: Array<{ request: CreateSubscriptionRequest; error: Error }>;
  }> {
    if (!requests || requests.length === 0) {
      throw TatumErrorFactory.createValidationError(
        'At least one subscription request is required',
        'requests',
        requests
      );
    }

    if (requests.length > 50) {
      throw TatumErrorFactory.createValidationError(
        'Maximum 50 subscriptions can be created in a batch',
        'requests.length',
        requests.length
      );
    }

    logger.info('Creating batch subscriptions', {
      count: requests.length
    });

    const results = {
      successful: [] as Array<{ request: CreateSubscriptionRequest; response: SubscriptionResponse }>,
      failed: [] as Array<{ request: CreateSubscriptionRequest; error: Error }>
    };

    // Process subscriptions sequentially to avoid rate limits
    for (const request of requests) {
      try {
        const response = await this.createSubscription(request);
        if (response.success) {
          results.successful.push({ request, response: response.data });
        }
      } catch (error) {
        results.failed.push({ request, error: error as Error });
      }

      // Small delay to prevent overwhelming the API
      await this.sleep(100);
    }

    logger.info('Batch subscription creation completed', {
      successful: results.successful.length,
      failed: results.failed.length,
      total: requests.length
    });

    return results;
  }

  /**
   * サブスクリプション一括削除
   */
  async deleteBatchSubscriptions(
    subscriptionIds: string[]
  ): Promise<{
    successful: string[];
    failed: Array<{ id: string; error: Error }>;
  }> {
    if (!subscriptionIds || subscriptionIds.length === 0) {
      throw TatumErrorFactory.createValidationError(
        'At least one subscription ID is required',
        'subscriptionIds',
        subscriptionIds
      );
    }

    if (subscriptionIds.length > 50) {
      throw TatumErrorFactory.createValidationError(
        'Maximum 50 subscriptions can be deleted in a batch',
        'subscriptionIds.length',
        subscriptionIds.length
      );
    }

    logger.info('Deleting batch subscriptions', {
      count: subscriptionIds.length
    });

    const results = {
      successful: [] as string[],
      failed: [] as Array<{ id: string; error: Error }>
    };

    // Process deletions sequentially
    for (const id of subscriptionIds) {
      try {
        const response = await this.deleteSubscription(id);
        if (response.success) {
          results.successful.push(id);
        }
      } catch (error) {
        results.failed.push({ id, error: error as Error });
      }

      // Small delay to prevent overwhelming the API
      await this.sleep(100);
    }

    logger.info('Batch subscription deletion completed', {
      successful: results.successful.length,
      failed: results.failed.length,
      total: subscriptionIds.length
    });

    return results;
  }

  // ====================================
  // Undefined Integration Methods
  // ====================================

  /**
   * Undefined形式でのサブスクリプション作成
   */
  async createUndefinedSubscription(
    address: string,
    chain: UndefinedChain,
    network: UndefinedNetwork,
    asset: UndefinedAsset,
    webhookUrl: string,
    subscriptionType: SubscriptionType = 'ADDRESS_TRANSACTION'
  ): Promise<TatumApiResponse<SubscriptionResponse>> {
    // Convert Undefined format to Tatum format
    const tatumChain = TatumConfig.mapUndefinedToTatum(chain, network, asset);

    const request: CreateSubscriptionRequest = {
      type: subscriptionType,
      attr: {
        address,
        chain: tatumChain,
        url: webhookUrl
      }
    };

    logger.info('Creating Undefined subscription', {
      undefinedChain: chain,
      undefinedNetwork: network,
      undefinedAsset: asset,
      tatumChain,
      address,
      subscriptionType
    });

    return this.createSubscription(request);
  }

  /**
   * 既存tatum-subscription-ensure互換インターフェース
   */
  async ensureSubscription(params: {
    address: string;
    chain: UndefinedChain;
    network: UndefinedNetwork;
    asset: UndefinedAsset;
    webhookUrl?: string;
  }): Promise<{
    subscriptionId: string;
    address: string;
    chain: UndefinedChain;
    network: UndefinedNetwork;
    asset: UndefinedAsset;
    status: 'active' | 'created' | 'existing';
    created: string;
    provider: 'tatum';
  }> {
    const { address, chain, network, asset } = params;
    const webhookUrl = params.webhookUrl || Deno.env.get('TATUM_WEBHOOK_URL');

    if (!webhookUrl) {
      throw TatumErrorFactory.createValidationError(
        'Webhook URL is required',
        'webhookUrl',
        webhookUrl
      );
    }

    try {
      // Try to find existing subscription first
      const existingSubscriptions = await this.listSubscriptions({
        chain: TatumConfig.mapUndefinedToTatum(chain, network, asset)
      });

      if (existingSubscriptions.success) {
        const existing = existingSubscriptions.data.data.find(sub =>
          sub.attr.address === address && sub.active
        );

        if (existing) {
          logger.info('Found existing subscription', {
            subscriptionId: existing.id,
            address,
            chain,
            network,
            asset
          });

          return {
            subscriptionId: existing.id,
            address,
            chain,
            network,
            asset,
            status: 'existing',
            created: existing.created,
            provider: 'tatum'
          };
        }
      }

      // Create new subscription
      const response = await this.createUndefinedSubscription(
        address,
        chain,
        network,
        asset,
        webhookUrl
      );

      if (response.success) {
        return {
          subscriptionId: response.data.id,
          address,
          chain,
          network,
          asset,
          status: 'created',
          created: response.data.created,
          provider: 'tatum'
        };
      }

      throw new TatumSubscriptionError('Failed to create subscription');

    } catch (error) {
      logger.error('Failed to ensure subscription', error as Error, {
        address,
        chain,
        network,
        asset
      });
      throw error;
    }
  }

  // ====================================
  // Private Utilities
  // ====================================

  private validateCreateRequest(request: CreateSubscriptionRequest): void {
    const errors: string[] = [];

    // Validate subscription type
    if (!request.type) {
      errors.push('Subscription type is required');
    } else if (!this.isValidSubscriptionType(request.type)) {
      errors.push(`Invalid subscription type: ${request.type}`);
    }

    // Validate attributes
    if (!request.attr) {
      errors.push('Subscription attributes are required');
    } else {
      const attrErrors = this.validateSubscriptionAttributes(request.attr, request.type);
      errors.push(...attrErrors);
    }

    if (errors.length > 0) {
      throw new TatumValidationError(
        `Subscription validation failed: ${errors.join(', ')}`
      );
    }
  }

  private validateSubscriptionAttributes(
    attr: SubscriptionAttributes,
    type: SubscriptionType
  ): string[] {
    const errors: string[] = [];

    // Validate chain
    if (!attr.chain) {
      errors.push('Chain is required');
    } else if (!this.isValidChain(attr.chain)) {
      errors.push(`Invalid chain: ${attr.chain}`);
    }

    // Validate URL
    if (!attr.url) {
      errors.push('Webhook URL is required');
    } else {
      const urlErrors = ValidationUtils.validateStringLength(
        attr.url,
        10,
        2000,
        'Webhook URL'
      );
      errors.push(...urlErrors);

      // Validate URL format
      if (urlErrors.length === 0 && !this.isValidUrl(attr.url)) {
        errors.push('Invalid webhook URL format');
      }
    }

    // Type-specific validation
    if (type === 'ADDRESS_TRANSACTION' || type === 'ACCOUNT_BALANCE') {
      if (!attr.address) {
        errors.push('Address is required for this subscription type');
      } else {
        const addressErrors = ValidationUtils.validateStringLength(
          attr.address,
          10,
          100,
          'Address'
        );
        errors.push(...addressErrors);
      }
    }

    if (type === 'CONTRACT_LOG_EVENT') {
      if (!attr.contractAddress) {
        errors.push('Contract address is required for contract log events');
      }
    }

    // Validate block range if provided
    if (attr.from !== undefined && attr.to !== undefined) {
      if (attr.from > attr.to) {
        errors.push('Start block must be less than or equal to end block');
      }
    }

    return errors;
  }

  private isValidSubscriptionType(type: string): type is SubscriptionType {
    return [
      'ADDRESS_TRANSACTION',
      'ACCOUNT_BALANCE',
      'TOKEN_TRANSFER',
      'CONTRACT_LOG_EVENT',
      'BLOCK_MINED',
      'PENDING_TRANSACTION'
    ].includes(type);
  }

  private isValidChain(chain: string): chain is SupportedChain {
    return [
      'ETH', 'ETH_SEPOLIA',
      'BTC', 'BTC_TESTNET',
      'TRX', 'TRX_SHASTA',
      'XRP', 'XRP_TESTNET',
      'ADA'
    ].includes(chain);
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ====================================
// Subscription Helper Functions
// ====================================

export class SubscriptionHelpers {
  /**
   * サブスクリプション一覧のフィルタリング
   */
  static filterSubscriptions(
    subscriptions: SubscriptionResponse[],
    filters: {
      active?: boolean;
      type?: SubscriptionType;
      chain?: SupportedChain;
      address?: string;
      createdAfter?: string;
      createdBefore?: string;
    }
  ): SubscriptionResponse[] {
    return subscriptions.filter(sub => {
      if (filters.active !== undefined && sub.active !== filters.active) {
        return false;
      }

      if (filters.type && sub.type !== filters.type) {
        return false;
      }

      if (filters.chain && sub.attr.chain !== filters.chain) {
        return false;
      }

      if (filters.address && sub.attr.address !== filters.address) {
        return false;
      }

      if (filters.createdAfter) {
        const createdDate = new Date(sub.created);
        const afterDate = new Date(filters.createdAfter);
        if (createdDate <= afterDate) {
          return false;
        }
      }

      if (filters.createdBefore) {
        const createdDate = new Date(sub.created);
        const beforeDate = new Date(filters.createdBefore);
        if (createdDate >= beforeDate) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * サブスクリプション統計情報
   */
  static getSubscriptionStats(subscriptions: SubscriptionResponse[]): {
    total: number;
    active: number;
    inactive: number;
    byType: Record<SubscriptionType, number>;
    byChain: Record<SupportedChain, number>;
    oldestCreated: string | null;
    newestCreated: string | null;
  } {
    const stats = {
      total: subscriptions.length,
      active: 0,
      inactive: 0,
      byType: {} as Record<SubscriptionType, number>,
      byChain: {} as Record<SupportedChain, number>,
      oldestCreated: null as string | null,
      newestCreated: null as string | null
    };

    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    subscriptions.forEach(sub => {
      // Active/inactive count
      if (sub.active) {
        stats.active++;
      } else {
        stats.inactive++;
      }

      // By type
      stats.byType[sub.type] = (stats.byType[sub.type] || 0) + 1;

      // By chain
      stats.byChain[sub.attr.chain] = (stats.byChain[sub.attr.chain] || 0) + 1;

      // Date tracking
      const createdDate = new Date(sub.created);
      if (!oldestDate || createdDate < oldestDate) {
        oldestDate = createdDate;
        stats.oldestCreated = sub.created;
      }
      if (!newestDate || createdDate > newestDate) {
        newestDate = createdDate;
        stats.newestCreated = sub.created;
      }
    });

    return stats;
  }

  /**
   * サブスクリプション重複検出
   */
  static findDuplicateSubscriptions(
    subscriptions: SubscriptionResponse[]
  ): Array<{
    key: string;
    subscriptions: SubscriptionResponse[];
  }> {
    const groups = new Map<string, SubscriptionResponse[]>();

    subscriptions.forEach(sub => {
      const key = `${sub.type}:${sub.attr.chain}:${sub.attr.address || 'no-address'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(sub);
    });

    return Array.from(groups.entries())
      .filter(([_, subs]) => subs.length > 1)
      .map(([key, subs]) => ({ key, subscriptions: subs }));
  }
}