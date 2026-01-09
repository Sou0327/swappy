/**
 * Supabaseクライアントのモック（sweep-planner用）
 * address-allocatorで確立したPromiseパターンを適用
 */

import { TEST_USER_ID } from './fixtures.ts';

interface MockSupabaseResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

class MockSupabaseState {
  adminWallets: Map<string, any> = new Map();
  deposits: Map<string, any> = new Map();
  sweepJobs: Map<string, any> = new Map();

  reset() {
    this.adminWallets.clear();
    this.deposits.clear();
    this.sweepJobs.clear();
  }
}

export const mockSupabaseState = new MockSupabaseState();

export function createMockSupabaseClient(isServiceRole = true) {
  return {
    from: (table: string) => createTableQuery(table, isServiceRole),
  };
}

function createTableQuery(table: string, isServiceRole: boolean) {
  const query: any = {
    _table: table,
    _filters: [] as Array<{ column: string; operator: string; value: any }>,
    _select: '*',
    _single: false,
    _limit: null as number | null,
    _updates: null as Record<string, any> | null,
    _inserts: null as Array<any> | null,
    _order: null as { column: string; ascending: boolean } | null,

    select: function (columns = '*') {
      this._select = columns;
      return this;
    },

    eq: function (column: string, value: any) {
      this._filters.push({ column, operator: 'eq', value });
      return this;
    },

    in: function (column: string, values: any[]) {
      this._filters.push({ column, operator: 'in', value: values });
      return this;
    },

    order: function (column: string, options: { ascending: boolean }) {
      this._order = { column, ascending: options.ascending };
      return this;
    },

    limit: function (count: number) {
      this._limit = count;
      return this;
    },

    maybeSingle: function () {
      this._single = true;
      const self = this;
      return new Promise<MockSupabaseResponse>(async (resolve) => {
        const result = await executeQuery(self);
        resolve(result);
      });
    },

    single: function () {
      this._single = true;
      const self = this;
      return new Promise<MockSupabaseResponse>(async (resolve) => {
        const result = await executeQuery(self);
        resolve(result);
      });
    },

    update: function (data: Record<string, any>) {
      this._updates = data;
      return this;
    },

    insert: function (data: any | any[]) {
      this._inserts = Array.isArray(data) ? data : [data];
      const self = this;

      // insert().select() チェーン用
      return {
        select: function (columns = '*') {
          return new Promise<MockSupabaseResponse>(async (resolve) => {
            const result = await executeInsert(self);
            resolve(result);
          });
        },
        // insert単独でもPromiseを返す
        then: function (resolve: (value: MockSupabaseResponse) => void) {
          executeInsert(self).then(resolve);
        },
        // maybeSingleチェーン用
        maybeSingle: function () {
          return new Promise<MockSupabaseResponse>(async (resolve) => {
            const result = await executeInsert(self);
            // insertの結果から最初の要素を返す
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
              resolve({ data: result.data[0], error: null });
            } else {
              resolve({ data: null, error: null });
            }
          });
        }
      };
    },

    // Promiseメソッド（select後の実行用）
    then: function (resolve: (value: MockSupabaseResponse) => void) {
      const self = this;
      executeQuery(self).then(resolve);
    },
  };

  // update/insertの場合、直接Promiseを返す
  const originalUpdate = query.update;
  query.update = function (data: Record<string, any>) {
    this._updates = data;
    const self = this;

    // eqチェーン用のラッパー
    return {
      eq: function (column: string, value: any) {
        self._filters.push({ column, operator: 'eq', value });
        return new Promise<MockSupabaseResponse>(async (resolve) => {
          const result = await executeUpdate(self);
          resolve(result);
        });
      },
    };
  };

  return query;
}

async function executeQuery(query: any): Promise<MockSupabaseResponse> {
  const { _table, _filters, _single, _limit, _order } = query;

  if (_table === 'admin_wallets') {
    const chainFilter = _filters.find((f: any) => f.column === 'chain');
    const networkFilter = _filters.find((f: any) => f.column === 'network');
    const assetFilter = _filters.find((f: any) => f.column === 'asset');
    const activeFilter = _filters.find((f: any) => f.column === 'active');

    let results = Array.from(mockSupabaseState.adminWallets.values());

    if (chainFilter) {
      results = results.filter(r => r.chain === chainFilter.value);
    }
    if (networkFilter) {
      results = results.filter(r => r.network === networkFilter.value);
    }
    if (assetFilter) {
      results = results.filter(r => r.asset === assetFilter.value);
    }
    if (activeFilter) {
      results = results.filter(r => r.active === activeFilter.value);
    }

    if (_single) {
      return { data: results[0] || null, error: null };
    }
    return { data: results, error: null };
  }

  if (_table === 'deposits') {
    const statusFilter = _filters.find((f: any) => f.column === 'status');
    const chainFilter = _filters.find((f: any) => f.column === 'chain');
    const networkFilter = _filters.find((f: any) => f.column === 'network');
    const assetFilter = _filters.find((f: any) => f.column === 'asset');
    const idInFilter = _filters.find((f: any) => f.column === 'id' && f.operator === 'in');

    let results = Array.from(mockSupabaseState.deposits.values());

    if (statusFilter) {
      results = results.filter(r => r.status === statusFilter.value);
    }
    if (chainFilter) {
      results = results.filter(r => r.chain === chainFilter.value);
    }
    if (networkFilter) {
      results = results.filter(r => r.network === networkFilter.value);
    }
    if (assetFilter) {
      results = results.filter(r => r.asset === assetFilter.value);
    }
    if (idInFilter) {
      results = results.filter(r => idInFilter.value.includes(r.id));
    }

    // order適用
    if (_order) {
      results.sort((a, b) => {
        const aVal = a[_order.column];
        const bVal = b[_order.column];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return _order.ascending ? comparison : -comparison;
      });
    }

    if (_limit) {
      results = results.slice(0, _limit);
    }

    if (_single) {
      return { data: results[0] || null, error: null };
    }
    return { data: results, error: null };
  }

  if (_table === 'sweep_jobs') {
    const depositIdFilter = _filters.find((f: any) => f.column === 'deposit_id');

    let results = Array.from(mockSupabaseState.sweepJobs.values());

    if (depositIdFilter) {
      results = results.filter(r => r.deposit_id === depositIdFilter.value);
    }

    if (_single) {
      return { data: results[0] || null, error: null };
    }
    return { data: results, error: null };
  }

  return { data: null, error: null };
}

async function executeUpdate(query: any): Promise<MockSupabaseResponse> {
  const { _table, _filters, _updates } = query;

  if (_table === 'sweep_jobs') {
    const idFilter = _filters.find((f: any) => f.column === 'id');
    if (idFilter) {
      const job = mockSupabaseState.sweepJobs.get(idFilter.value);
      if (job) {
        const updated = { ...job, ..._updates };
        mockSupabaseState.sweepJobs.set(idFilter.value, updated);
        return { data: updated, error: null };
      }
    }
  }

  return { data: null, error: null };
}

async function executeInsert(query: any): Promise<MockSupabaseResponse> {
  const { _table, _inserts } = query;

  if (_table === 'sweep_jobs' && _inserts) {
    const inserted: any[] = [];
    for (const insert of _inserts) {
      const id = insert.id || `sweep-job-${Date.now()}-${Math.random()}`;
      const job = { ...insert, id };
      mockSupabaseState.sweepJobs.set(id, job);
      inserted.push(job);
    }
    return { data: inserted, error: null };
  }

  return { data: null, error: null };
}

export const mockSupabaseFactory = {
  createClient: createMockSupabaseClient,
  getState: () => mockSupabaseState,
  resetState: () => mockSupabaseState.reset(),
};
