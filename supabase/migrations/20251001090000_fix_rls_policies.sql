BEGIN;

-- 共通で使用するヘルパー: リクエストユーザーIDを安定的に取得
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

-- =============================
-- profiles
-- =============================
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY profiles_select_policy
  ON public.profiles
  FOR SELECT
  USING (
    (id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY profiles_update_policy
  ON public.profiles
  FOR UPDATE
  USING (
    (id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

-- =============================
-- user_roles
-- =============================
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY user_roles_select_policy
  ON public.user_roles
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY user_roles_insert_policy
  ON public.user_roles
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY user_roles_update_policy
  ON public.user_roles
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY user_roles_delete_policy
  ON public.user_roles
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- deposits
-- =============================
DROP POLICY IF EXISTS "Users can view their own deposits" ON public.deposits;
DROP POLICY IF EXISTS "Admins can view all deposits" ON public.deposits;
DROP POLICY IF EXISTS "Users can create their own deposits" ON public.deposits;
DROP POLICY IF EXISTS "Admins can update all deposits" ON public.deposits;

CREATE POLICY deposits_select_policy
  ON public.deposits
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposits_insert_policy
  ON public.deposits
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposits_update_policy
  ON public.deposits
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY deposits_delete_policy
  ON public.deposits
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- withdrawals
-- =============================
DROP POLICY IF EXISTS "Users can view their own withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Users can create their own withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Admins can update all withdrawals" ON public.withdrawals;

CREATE POLICY withdrawals_select_policy
  ON public.withdrawals
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY withdrawals_insert_policy
  ON public.withdrawals
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY withdrawals_update_policy
  ON public.withdrawals
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY withdrawals_delete_policy
  ON public.withdrawals
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- user_assets
-- =============================
DROP POLICY IF EXISTS "Users can view their own assets" ON public.user_assets;
DROP POLICY IF EXISTS "Admins can view all assets" ON public.user_assets;
DROP POLICY IF EXISTS "Admins can manage all assets" ON public.user_assets;

CREATE POLICY user_assets_select_policy
  ON public.user_assets
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY user_assets_insert_policy
  ON public.user_assets
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY user_assets_update_policy
  ON public.user_assets
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY user_assets_delete_policy
  ON public.user_assets
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- markets
-- =============================
DROP POLICY IF EXISTS "Read active markets (anon)" ON public.markets;
DROP POLICY IF EXISTS "Read active markets (auth)" ON public.markets;
DROP POLICY IF EXISTS "Admins manage markets" ON public.markets;

CREATE POLICY markets_select_anon_policy
  ON public.markets
  FOR SELECT
  TO anon
  USING (status = 'active');

CREATE POLICY markets_select_auth_policy
  ON public.markets
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY markets_insert_policy
  ON public.markets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY markets_update_policy
  ON public.markets
  FOR UPDATE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY markets_delete_policy
  ON public.markets
  FOR DELETE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- orders
-- =============================
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;

CREATE POLICY orders_select_policy
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY orders_insert_policy
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY orders_update_policy
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY orders_delete_policy
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- ledger_entries
-- =============================
DROP POLICY IF EXISTS "Users view own ledger" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins manage ledger" ON public.ledger_entries;

CREATE POLICY ledger_entries_select_policy
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY ledger_entries_insert_policy
  ON public.ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY ledger_entries_update_policy
  ON public.ledger_entries
  FOR UPDATE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY ledger_entries_delete_policy
  ON public.ledger_entries
  FOR DELETE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- audit_logs
-- =============================
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins write audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY audit_logs_select_policy
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY audit_logs_insert_policy
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY audit_logs_service_insert_policy
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================
-- support_tickets
-- =============================
DROP POLICY IF EXISTS "Users view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users create own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins manage tickets" ON public.support_tickets;

CREATE POLICY support_tickets_select_policy
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY support_tickets_insert_policy
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY support_tickets_update_policy
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY support_tickets_delete_policy
  ON public.support_tickets
  FOR DELETE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- support_replies
-- =============================
DROP POLICY IF EXISTS "Users read own ticket replies" ON public.support_replies;
DROP POLICY IF EXISTS "Users add replies" ON public.support_replies;

CREATE POLICY support_replies_select_policy
  ON public.support_replies
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_replies.ticket_id
        AND st.user_id = public.requesting_user_id()
    )
  );

CREATE POLICY support_replies_insert_policy
  ON public.support_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_replies.ticket_id
        AND st.user_id = public.requesting_user_id()
    )
  );

-- =============================
-- user_deposit_addresses & auto_transfers
-- =============================
DROP POLICY IF EXISTS "Users can view their own deposit addresses" ON public.user_deposit_addresses;
DROP POLICY IF EXISTS "Users can insert their own deposit addresses" ON public.user_deposit_addresses;
DROP POLICY IF EXISTS "Admins can view all deposit addresses" ON public.user_deposit_addresses;
DROP POLICY IF EXISTS "Admins can manage all deposit addresses" ON public.user_deposit_addresses;

CREATE POLICY user_deposit_addresses_select_policy
  ON public.user_deposit_addresses
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY user_deposit_addresses_insert_policy
  ON public.user_deposit_addresses
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY user_deposit_addresses_update_policy
  ON public.user_deposit_addresses
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY user_deposit_addresses_delete_policy
  ON public.user_deposit_addresses
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can view their own auto transfers" ON public.auto_transfers;
DROP POLICY IF EXISTS "Admins can view all auto transfers" ON public.auto_transfers;
DROP POLICY IF EXISTS "Admins can manage all auto transfers" ON public.auto_transfers;

CREATE POLICY auto_transfers_select_policy
  ON public.auto_transfers
  FOR SELECT
  USING (
    public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_deposit_addresses uda
      WHERE uda.id = auto_transfers.deposit_address_id
        AND uda.user_id = public.requesting_user_id()
    )
  );

CREATE POLICY auto_transfers_insert_policy
  ON public.auto_transfers
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY auto_transfers_update_policy
  ON public.auto_transfers
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY auto_transfers_delete_policy
  ON public.auto_transfers
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- deposit_addresses
-- =============================
DROP POLICY IF EXISTS "Users can view own deposit addresses" ON public.deposit_addresses;
DROP POLICY IF EXISTS "Users can insert own deposit addresses" ON public.deposit_addresses;
DROP POLICY IF EXISTS "Users can update own deposit addresses" ON public.deposit_addresses;
DROP POLICY IF EXISTS "Admins can manage all deposit addresses" ON public.deposit_addresses;

CREATE POLICY deposit_addresses_select_policy
  ON public.deposit_addresses
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposit_addresses_insert_policy
  ON public.deposit_addresses
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposit_addresses_update_policy
  ON public.deposit_addresses
  FOR UPDATE
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposit_addresses_delete_policy
  ON public.deposit_addresses
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- deposit_transactions
-- =============================
DROP POLICY IF EXISTS "Users can view their own deposit transactions" ON public.deposit_transactions;
DROP POLICY IF EXISTS "Admins can manage all deposit transactions" ON public.deposit_transactions;

CREATE POLICY deposit_transactions_select_policy
  ON public.deposit_transactions
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY deposit_transactions_insert_policy
  ON public.deposit_transactions
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY deposit_transactions_update_policy
  ON public.deposit_transactions
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY deposit_transactions_delete_policy
  ON public.deposit_transactions
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- notifications
-- =============================
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY notifications_select_policy
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY notifications_update_policy
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY notifications_insert_policy
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY notifications_service_insert_policy
  ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY notifications_delete_policy
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- dead_letter_events
-- =============================
DROP POLICY IF EXISTS "Service role can access all dead letter events" ON public.dead_letter_events;
DROP POLICY IF EXISTS "Admin users can manage dead letter events" ON public.dead_letter_events;

CREATE POLICY dead_letter_events_service_policy
  ON public.dead_letter_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY dead_letter_events_admin_policy
  ON public.dead_letter_events
  FOR ALL
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- webhook_errors
-- =============================
DROP POLICY IF EXISTS "Admin users can view all webhook errors" ON public.webhook_errors;
DROP POLICY IF EXISTS "Admin users can update webhook errors" ON public.webhook_errors;
DROP POLICY IF EXISTS "System can insert webhook errors" ON public.webhook_errors;

CREATE POLICY webhook_errors_select_policy
  ON public.webhook_errors
  FOR SELECT
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY webhook_errors_update_policy
  ON public.webhook_errors
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY webhook_errors_insert_policy
  ON public.webhook_errors
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================
-- currency_conversions
-- =============================
DROP POLICY IF EXISTS "Users can view own conversions" ON public.currency_conversions;
DROP POLICY IF EXISTS "Admins can view all conversions" ON public.currency_conversions;

CREATE POLICY currency_conversions_select_policy
  ON public.currency_conversions
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY currency_conversions_insert_policy
  ON public.currency_conversions
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY currency_conversions_update_policy
  ON public.currency_conversions
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY currency_conversions_delete_policy
  ON public.currency_conversions
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- conversion_fees
-- =============================
DROP POLICY IF EXISTS "Admins can manage fees" ON public.conversion_fees;
DROP POLICY IF EXISTS "Anyone can view active fees" ON public.conversion_fees;

CREATE POLICY conversion_fees_select_policy
  ON public.conversion_fees
  FOR SELECT
  USING (
    is_active = true
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY conversion_fees_insert_policy
  ON public.conversion_fees
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY conversion_fees_update_policy
  ON public.conversion_fees
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY conversion_fees_delete_policy
  ON public.conversion_fees
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- chain_configs
-- =============================
DROP POLICY IF EXISTS "All users can view chain configs" ON public.chain_configs;
DROP POLICY IF EXISTS "Admins can manage chain configs" ON public.chain_configs;

CREATE POLICY chain_configs_select_policy
  ON public.chain_configs
  FOR SELECT
  USING (true);

CREATE POLICY chain_configs_insert_policy
  ON public.chain_configs
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY chain_configs_update_policy
  ON public.chain_configs
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY chain_configs_delete_policy
  ON public.chain_configs
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- xrp_fixed_addresses
-- =============================
DROP POLICY IF EXISTS "Admins can manage XRP addresses" ON public.xrp_fixed_addresses;

CREATE POLICY xrp_fixed_addresses_policy
  ON public.xrp_fixed_addresses
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- admin_wallets / sweep_jobs / wallet_roots / chain_progress
-- =============================
DROP POLICY IF EXISTS "Admins can manage admin wallets" ON public.admin_wallets;
CREATE POLICY admin_wallets_policy
  ON public.admin_wallets
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can manage sweep jobs" ON public.sweep_jobs;
CREATE POLICY sweep_jobs_policy
  ON public.sweep_jobs
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage wallet roots" ON public.wallet_roots;
CREATE POLICY wallet_roots_policy
  ON public.wallet_roots
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage chain progress" ON public.chain_progress;
CREATE POLICY chain_progress_policy
  ON public.chain_progress
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin_only_master_keys_policy" ON public.master_keys;
CREATE POLICY master_keys_admin_policy
  ON public.master_keys
  FOR ALL
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- deposit_detection_state / deposit_confirmation_configs / deposit_approval_rules / manual_approval_queue
-- =============================
DROP POLICY IF EXISTS "Admin access only on deposit_detection_state" ON public.deposit_detection_state;
CREATE POLICY deposit_detection_state_policy
  ON public.deposit_detection_state
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin access only on deposit_confirmation_configs" ON public.deposit_confirmation_configs;
CREATE POLICY deposit_confirmation_configs_policy
  ON public.deposit_confirmation_configs
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin access only on deposit_approval_rules" ON public.deposit_approval_rules;
CREATE POLICY deposit_approval_rules_policy
  ON public.deposit_approval_rules
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin access only on manual_approval_queue" ON public.manual_approval_queue;
CREATE POLICY manual_approval_queue_policy
  ON public.manual_approval_queue
  FOR ALL
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- kyc_documents / kyc_applications / kyc_settings
-- =============================
DROP POLICY IF EXISTS "Users can view own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can view their own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can insert own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can insert their own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Admins can view all KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Admins can update all KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Admins can manage all KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Moderators can view KYC documents for review" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can upload their own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can update their own KYC documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can delete their own KYC documents" ON public.kyc_documents;

CREATE POLICY kyc_documents_select_policy
  ON public.kyc_documents
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
    OR public.has_role(public.requesting_user_id(), 'moderator'::public.app_role)
  );

CREATE POLICY kyc_documents_insert_policy
  ON public.kyc_documents
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY kyc_documents_update_policy
  ON public.kyc_documents
  FOR UPDATE
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY kyc_documents_delete_policy
  ON public.kyc_documents
  FOR DELETE
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Users can view their own KYC applications" ON public.kyc_applications;
DROP POLICY IF EXISTS "Users can create their own KYC applications" ON public.kyc_applications;
DROP POLICY IF EXISTS "Admins can manage all KYC applications" ON public.kyc_applications;

CREATE POLICY kyc_applications_select_policy
  ON public.kyc_applications
  FOR SELECT
  USING (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY kyc_applications_insert_policy
  ON public.kyc_applications
  FOR INSERT
  WITH CHECK (
    (user_id = public.requesting_user_id())
    OR public.has_role(public.requesting_user_id(), 'admin'::public.app_role)
  );

CREATE POLICY kyc_applications_update_policy
  ON public.kyc_applications
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY kyc_applications_delete_policy
  ON public.kyc_applications
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can manage KYC settings" ON public.kyc_settings;
DROP POLICY IF EXISTS "All users can view KYC settings" ON public.kyc_settings;
DROP POLICY IF EXISTS "Users can view KYC settings" ON public.kyc_settings;

CREATE POLICY kyc_settings_select_policy
  ON public.kyc_settings
  FOR SELECT
  USING (
    TRUE
  );

CREATE POLICY kyc_settings_insert_policy
  ON public.kyc_settings
  FOR INSERT
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY kyc_settings_update_policy
  ON public.kyc_settings
  FOR UPDATE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY kyc_settings_delete_policy
  ON public.kyc_settings
  FOR DELETE
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

-- =============================
-- notifications helper functions already updated above
-- =============================

-- =============================
-- user_assets related admin tables already handled
-- =============================

COMMIT;
