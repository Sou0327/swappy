export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_wallets: {
        Row: {
          active: boolean
          address: string
          asset: string
          chain: string
          created_at: string
          id: string
          network: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          asset: string
          chain: string
          created_at?: string
          id?: string
          network: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          asset?: string
          chain?: string
          created_at?: string
          id?: string
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown | null
          metadata: Json | null
          resource: string
          resource_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          resource?: string
          resource_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          resource?: string
          resource_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_transfers: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string | null
          currency: string
          deposit_address_id: string
          deposit_id: string | null
          error_message: string | null
          from_address: string
          gas_fee: number | null
          id: string
          network: string
          status: string | null
          to_address: string
          tx_hash: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string | null
          currency: string
          deposit_address_id: string
          deposit_id?: string | null
          error_message?: string | null
          from_address: string
          gas_fee?: number | null
          id?: string
          network: string
          status?: string | null
          to_address: string
          tx_hash?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string
          deposit_address_id?: string
          deposit_id?: string | null
          error_message?: string | null
          from_address?: string
          gas_fee?: number | null
          id?: string
          network?: string
          status?: string | null
          to_address?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_transfers_deposit_address_id_fkey"
            columns: ["deposit_address_id"]
            isOneToOne: false
            referencedRelation: "user_deposit_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_transfers_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_transfers_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "v_deposit_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_configs: {
        Row: {
          active: boolean | null
          asset: string
          chain: string
          config: Json | null
          created_at: string
          deposit_enabled: boolean
          id: string
          min_confirmations: number
          min_deposit: number
          network: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          asset: string
          chain: string
          config?: Json | null
          created_at?: string
          deposit_enabled?: boolean
          id?: string
          min_confirmations?: number
          min_deposit?: number
          network: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          asset?: string
          chain?: string
          config?: Json | null
          created_at?: string
          deposit_enabled?: boolean
          id?: string
          min_confirmations?: number
          min_deposit?: number
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      chain_progress: {
        Row: {
          asset: string
          chain: string
          id: string
          last_block: number
          network: string
          updated_at: string
        }
        Insert: {
          asset: string
          chain: string
          id?: string
          last_block?: number
          network: string
          updated_at?: string
        }
        Update: {
          asset?: string
          chain?: string
          id?: string
          last_block?: number
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversion_fees: {
        Row: {
          created_at: string
          fee_percentage: number
          from_currency: string
          id: string
          is_active: boolean
          maximum_fee: number | null
          minimum_fee: number | null
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_percentage: number
          from_currency: string
          id?: string
          is_active?: boolean
          maximum_fee?: number | null
          minimum_fee?: number | null
          to_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_percentage?: number
          from_currency?: string
          id?: string
          is_active?: boolean
          maximum_fee?: number | null
          minimum_fee?: number | null
          to_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      currency_conversions: {
        Row: {
          created_at: string
          exchange_rate: number
          fee_amount: number | null
          fee_percentage: number | null
          from_amount: number
          from_currency: string
          id: string
          status: string
          to_amount: number
          to_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exchange_rate: number
          fee_amount?: number | null
          fee_percentage?: number | null
          from_amount: number
          from_currency: string
          id?: string
          status?: string
          to_amount: number
          to_currency: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exchange_rate?: number
          fee_amount?: number | null
          fee_percentage?: number | null
          from_amount?: number
          from_currency?: string
          id?: string
          status?: string
          to_amount?: number
          to_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dead_letter_events: {
        Row: {
          created_at: string
          error_message: string
          error_type: string
          expires_at: string
          id: string
          max_retries: number
          next_retry_at: string
          payload: Json
          retry_count: number
          status: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type: string
          expires_at: string
          id?: string
          max_retries?: number
          next_retry_at: string
          payload: Json
          retry_count?: number
          status?: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string
          expires_at?: string
          id?: string
          max_retries?: number
          next_retry_at?: string
          payload?: Json
          retry_count?: number
          status?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: []
      }
      deposit_addresses: {
        Row: {
          active: boolean | null
          address: string
          address_index: number | null
          asset: string | null
          chain: string
          created_at: string
          derivation_path: string | null
          destination_tag: string | null
          id: string
          memo: string | null
          memo_tag: string | null
          network: string
          updated_at: string
          user_id: string
          xpub: string | null
        }
        Insert: {
          active?: boolean | null
          address: string
          address_index?: number | null
          asset?: string | null
          chain: string
          created_at?: string
          derivation_path?: string | null
          destination_tag?: string | null
          id?: string
          memo?: string | null
          memo_tag?: string | null
          network: string
          updated_at?: string
          user_id: string
          xpub?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string
          address_index?: number | null
          asset?: string | null
          chain?: string
          created_at?: string
          derivation_path?: string | null
          destination_tag?: string | null
          id?: string
          memo?: string | null
          memo_tag?: string | null
          network?: string
          updated_at?: string
          user_id?: string
          xpub?: string | null
        }
        Relationships: []
      }
      deposit_approval_rules: {
        Row: {
          asset: string
          auto_approve: boolean
          chain: string
          conditions: Json
          created_at: string
          enabled: boolean
          id: string
          max_amount: number
          min_amount: number
          network: string
          requires_manual_approval: boolean
          risk_level: string
          updated_at: string
        }
        Insert: {
          asset: string
          auto_approve?: boolean
          chain: string
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          max_amount?: number
          min_amount?: number
          network: string
          requires_manual_approval?: boolean
          risk_level?: string
          updated_at?: string
        }
        Update: {
          asset?: string
          auto_approve?: boolean
          chain?: string
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          max_amount?: number
          min_amount?: number
          network?: string
          requires_manual_approval?: boolean
          risk_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      deposit_confirmation_configs: {
        Row: {
          chain: string
          created_at: string
          enabled: boolean
          id: string
          max_confirmations: number
          min_confirmations: number
          network: string
          timeout_minutes: number
          updated_at: string
        }
        Insert: {
          chain: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_confirmations?: number
          min_confirmations?: number
          network: string
          timeout_minutes?: number
          updated_at?: string
        }
        Update: {
          chain?: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_confirmations?: number
          min_confirmations?: number
          network?: string
          timeout_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      deposit_detection_state: {
        Row: {
          chain: string
          last_block_height: number
          network: string
          updated_at: string
        }
        Insert: {
          chain: string
          last_block_height?: number
          network: string
          updated_at?: string
        }
        Update: {
          chain?: string
          last_block_height?: number
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      deposit_transactions: {
        Row: {
          amount: number
          asset: string | null
          block_hash: string | null
          block_number: number | null
          chain: string
          confirmations: number | null
          confirmed_at: string | null
          created_at: string | null
          deposit_address_id: string | null
          destination_tag: string | null
          detected_at: string | null
          fee_amount: number | null
          from_address: string
          id: string
          memo: string | null
          network: string
          processed_at: string | null
          raw_transaction: Json | null
          required_confirmations: number | null
          status: string | null
          to_address: string
          transaction_hash: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset?: string | null
          block_hash?: string | null
          block_number?: number | null
          chain: string
          confirmations?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          deposit_address_id?: string | null
          destination_tag?: string | null
          detected_at?: string | null
          fee_amount?: number | null
          from_address: string
          id?: string
          memo?: string | null
          network: string
          processed_at?: string | null
          raw_transaction?: Json | null
          required_confirmations?: number | null
          status?: string | null
          to_address: string
          transaction_hash: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string | null
          block_hash?: string | null
          block_number?: number | null
          chain?: string
          confirmations?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          deposit_address_id?: string | null
          destination_tag?: string | null
          detected_at?: string | null
          fee_amount?: number | null
          from_address?: string
          id?: string
          memo?: string | null
          network?: string
          processed_at?: string | null
          raw_transaction?: Json | null
          required_confirmations?: number | null
          status?: string | null
          to_address?: string
          transaction_hash?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_deposit_address_id_fkey"
            columns: ["deposit_address_id"]
            isOneToOne: false
            referencedRelation: "deposit_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          asset: string | null
          chain: string | null
          confirmations_observed: number | null
          confirmations_required: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          memo_tag: string | null
          network: string | null
          notes: string | null
          status: string
          transaction_hash: string | null
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          amount: number
          asset?: string | null
          chain?: string | null
          confirmations_observed?: number | null
          confirmations_required?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          memo_tag?: string | null
          network?: string | null
          notes?: string | null
          status?: string
          transaction_hash?: string | null
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          amount?: number
          asset?: string | null
          chain?: string | null
          confirmations_observed?: number | null
          confirmations_required?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          memo_tag?: string | null
          network?: string | null
          notes?: string | null
          status?: string
          transaction_hash?: string | null
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      dev_access_logs: {
        Row: {
          access_success: boolean | null
          access_timestamp: string | null
          additional_data: Json | null
          environment_info: Json | null
          failure_reason: string | null
          feature_name: string | null
          id: number
          ip_address: unknown | null
          session_duration_seconds: number | null
          session_ended_at: string | null
          session_id: string | null
          target_user_email: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          access_success?: boolean | null
          access_timestamp?: string | null
          additional_data?: Json | null
          environment_info?: Json | null
          failure_reason?: string | null
          feature_name?: string | null
          id?: number
          ip_address?: unknown | null
          session_duration_seconds?: number | null
          session_ended_at?: string | null
          session_id?: string | null
          target_user_email?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          access_success?: boolean | null
          access_timestamp?: string | null
          additional_data?: Json | null
          environment_info?: Json | null
          failure_reason?: string | null
          feature_name?: string | null
          id?: number
          ip_address?: unknown | null
          session_duration_seconds?: number | null
          session_ended_at?: string | null
          session_id?: string | null
          target_user_email?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      dev_auth_bypass: {
        Row: {
          allowed_user_patterns: string[] | null
          created_at: string | null
          daily_usage_limit: number | null
          disabled_at: string | null
          disabled_reason: string | null
          environment: string | null
          feature_name: string
          id: number
          is_enabled: boolean | null
          last_used_at: string | null
          master_token: string | null
          session_timeout_minutes: number | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          allowed_user_patterns?: string[] | null
          created_at?: string | null
          daily_usage_limit?: number | null
          disabled_at?: string | null
          disabled_reason?: string | null
          environment?: string | null
          feature_name: string
          id?: number
          is_enabled?: boolean | null
          last_used_at?: string | null
          master_token?: string | null
          session_timeout_minutes?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          allowed_user_patterns?: string[] | null
          created_at?: string | null
          daily_usage_limit?: number | null
          disabled_at?: string | null
          disabled_reason?: string | null
          environment?: string | null
          feature_name?: string
          id?: number
          is_enabled?: boolean | null
          last_used_at?: string | null
          master_token?: string | null
          session_timeout_minutes?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      dev_test_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          is_active: boolean | null
          test_data: Json | null
          test_scenario: string | null
          user_role: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          test_data?: Json | null
          test_scenario?: string | null
          user_role?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          test_data?: Json | null
          test_scenario?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      kyc_applications: {
        Row: {
          completed_at: string | null
          created_at: string | null
          external_application_id: string | null
          id: string
          level_name: string | null
          provider: string
          status: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          webhook_data: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          external_application_id?: string | null
          id?: string
          level_name?: string | null
          provider?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          webhook_data?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          external_application_id?: string | null
          id?: string
          level_name?: string | null
          provider?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          webhook_data?: Json | null
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kyc_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          kind: string
          locked_delta: number
          ref_id: string | null
          ref_type: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency: string
          id?: string
          kind: string
          locked_delta?: number
          ref_id?: string | null
          ref_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          locked_delta?: number
          ref_id?: string | null
          ref_type?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_approval_queue: {
        Row: {
          created_at: string
          deposit_id: string
          id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposit_id: string
          id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposit_id?: string
          id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_approval_queue_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_approval_queue_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "v_deposit_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          base: string
          created_at: string
          id: string
          maker_fee_rate: number
          min_notional: number
          price_tick: number
          qty_step: number
          quote: string
          status: string
          taker_fee_rate: number
          updated_at: string
        }
        Insert: {
          base: string
          created_at?: string
          id: string
          maker_fee_rate?: number
          min_notional?: number
          price_tick: number
          qty_step: number
          quote: string
          status?: string
          taker_fee_rate?: number
          updated_at?: string
        }
        Update: {
          base?: string
          created_at?: string
          id?: string
          maker_fee_rate?: number
          min_notional?: number
          price_tick?: number
          qty_step?: number
          quote?: string
          status?: string
          taker_fee_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_keys: {
        Row: {
          active: boolean | null
          backup_verified: boolean | null
          created_at: string | null
          created_by: string
          description: string | null
          encrypted_mnemonic: string
          id: string
          mnemonic_iv: string
          salt: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          backup_verified?: boolean | null
          created_at?: string | null
          created_by: string
          description?: string | null
          encrypted_mnemonic: string
          id?: string
          mnemonic_iv: string
          salt: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          backup_verified?: boolean | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          encrypted_mnemonic?: string
          id?: string
          mnemonic_iv?: string
          salt?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          client_id: string | null
          created_at: string
          filled_qty: number
          id: string
          market: string
          post_only: boolean
          price: number | null
          qty: number
          side: string
          status: string
          time_in_force: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          filled_qty?: number
          id?: string
          market: string
          post_only?: boolean
          price?: number | null
          qty: number
          side: string
          status?: string
          time_in_force?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          filled_qty?: number
          id?: string
          market?: string
          post_only?: boolean
          price?: number | null
          qty?: number
          side?: string
          status?: string
          time_in_force?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_fkey"
            columns: ["market"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          building: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          first_name_kana: string | null
          full_name: string | null
          id: string
          is_public: boolean | null
          kyc_level: number
          kyc_notes: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_updated_at: string | null
          last_name: string | null
          last_name_kana: string | null
          phishing_code: string | null
          postal_code: string | null
          prefecture: string | null
          updated_at: string
          user_handle: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          building?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          first_name_kana?: string | null
          full_name?: string | null
          id: string
          is_public?: boolean | null
          kyc_level?: number
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_updated_at?: string | null
          last_name?: string | null
          last_name_kana?: string | null
          phishing_code?: string | null
          postal_code?: string | null
          prefecture?: string | null
          updated_at?: string
          user_handle?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          building?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          first_name_kana?: string | null
          full_name?: string | null
          id?: string
          is_public?: boolean | null
          kyc_level?: number
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_updated_at?: string | null
          last_name?: string | null
          last_name_kana?: string | null
          phishing_code?: string | null
          postal_code?: string | null
          prefecture?: string | null
          updated_at?: string
          user_handle?: string | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referee_id: string
          referral_code_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referee_id: string
          referral_code_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referee_id?: string
          referral_code_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_status: {
        Row: {
          address: string
          asset: string
          auth_token: string | null
          chain: string
          confirmations: number | null
          created_at: string
          id: string
          network: string
          provider: string
          status: string
          subscription_id: string
          updated_at: string
          webhook_id: string | null
        }
        Insert: {
          address: string
          asset: string
          auth_token?: string | null
          chain: string
          confirmations?: number | null
          created_at?: string
          id?: string
          network: string
          provider?: string
          status?: string
          subscription_id: string
          updated_at?: string
          webhook_id?: string | null
        }
        Update: {
          address?: string
          asset?: string
          auth_token?: string | null
          chain?: string
          confirmations?: number | null
          created_at?: string
          id?: string
          network?: string
          provider?: string
          status?: string
          subscription_id?: string
          updated_at?: string
          webhook_id?: string | null
        }
        Relationships: []
      }
      support_replies: {
        Row: {
          created_at: string
          id: string
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          body: string | null
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sweep_jobs: {
        Row: {
          asset: string
          chain: string
          created_at: string
          currency: string
          deposit_id: string | null
          error_message: string | null
          from_address: string
          id: string
          network: string
          planned_amount: number
          signed_tx: string | null
          status: string
          to_address: string
          tx_hash: string | null
          unsigned_tx: Json | null
          updated_at: string
        }
        Insert: {
          asset: string
          chain: string
          created_at?: string
          currency: string
          deposit_id?: string | null
          error_message?: string | null
          from_address: string
          id?: string
          network: string
          planned_amount: number
          signed_tx?: string | null
          status?: string
          to_address: string
          tx_hash?: string | null
          unsigned_tx?: Json | null
          updated_at?: string
        }
        Update: {
          asset?: string
          chain?: string
          created_at?: string
          currency?: string
          deposit_id?: string | null
          error_message?: string | null
          from_address?: string
          id?: string
          network?: string
          planned_amount?: number
          signed_tx?: string | null
          status?: string
          to_address?: string
          tx_hash?: string | null
          unsigned_tx?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sweep_jobs_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sweep_jobs_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "v_deposit_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          id: string
          maker_fee: number
          maker_order_id: string
          market: string
          price: number
          qty: number
          taker_fee: number
          taker_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          maker_fee?: number
          maker_order_id: string
          market: string
          price: number
          qty: number
          taker_fee?: number
          taker_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          maker_fee?: number
          maker_order_id?: string
          market?: string
          price?: number
          qty?: number
          taker_fee?: number
          taker_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_maker_order_id_fkey"
            columns: ["maker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_market_fkey"
            columns: ["market"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_taker_order_id_fkey"
            columns: ["taker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_assets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_deposit_addresses: {
        Row: {
          address: string
          created_at: string | null
          currency: string
          derivation_path: string | null
          id: string
          is_active: boolean | null
          network: string
          private_key_encrypted: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string | null
          currency: string
          derivation_path?: string | null
          id?: string
          is_active?: boolean | null
          network: string
          private_key_encrypted?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string | null
          currency?: string
          derivation_path?: string | null
          id?: string
          is_active?: boolean | null
          network?: string
          private_key_encrypted?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_transfers: {
        Row: {
          admin_notes: string | null
          amount: number
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          error_message: string | null
          from_user_id: string
          id: string
          reference_number: string
          status: string
          to_user_id: string
          transaction_hash: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          completed_at?: string | null
          created_at?: string | null
          currency: string
          description?: string | null
          error_message?: string | null
          from_user_id: string
          id?: string
          reference_number?: string
          status?: string
          to_user_id: string
          transaction_hash?: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          error_message?: string | null
          from_user_id?: string
          id?: string
          reference_number?: string
          status?: string
          to_user_id?: string
          transaction_hash?: string
        }
        Relationships: []
      }
      wallet_roots: {
        Row: {
          active: boolean
          address_type: string
          asset: string
          auto_generated: boolean | null
          chain: string
          chain_code: string | null
          created_at: string
          derivation_path: string | null
          derivation_template: string
          id: string
          last_verified_at: string | null
          legacy_data: boolean | null
          master_key_id: string | null
          network: string
          next_index: number
          updated_at: string
          verified: boolean | null
          xpub: string
        }
        Insert: {
          active?: boolean
          address_type?: string
          asset: string
          auto_generated?: boolean | null
          chain: string
          chain_code?: string | null
          created_at?: string
          derivation_path?: string | null
          derivation_template?: string
          id?: string
          last_verified_at?: string | null
          legacy_data?: boolean | null
          master_key_id?: string | null
          network: string
          next_index?: number
          updated_at?: string
          verified?: boolean | null
          xpub: string
        }
        Update: {
          active?: boolean
          address_type?: string
          asset?: string
          auto_generated?: boolean | null
          chain?: string
          chain_code?: string | null
          created_at?: string
          derivation_path?: string | null
          derivation_template?: string
          id?: string
          last_verified_at?: string | null
          legacy_data?: boolean | null
          master_key_id?: string | null
          network?: string
          next_index?: number
          updated_at?: string
          verified?: boolean | null
          xpub?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_roots_master_key_id_fkey"
            columns: ["master_key_id"]
            isOneToOne: false
            referencedRelation: "master_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_errors: {
        Row: {
          address: string
          chain: string
          created_at: string | null
          error_code: string | null
          error_message: string
          error_type: string | null
          id: string
          network: string
          processing_attempt: number | null
          request_headers: Json | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          response_status: number | null
          retry_after: string | null
          subscription_id: string | null
          updated_at: string | null
          webhook_payload: Json | null
        }
        Insert: {
          address: string
          chain: string
          created_at?: string | null
          error_code?: string | null
          error_message: string
          error_type?: string | null
          id?: string
          network: string
          processing_attempt?: number | null
          request_headers?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_status?: number | null
          retry_after?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          webhook_payload?: Json | null
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string
          error_type?: string | null
          id?: string
          network?: string
          processing_attempt?: number | null
          request_headers?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_status?: number | null
          retry_after?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          webhook_payload?: Json | null
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          notes: string | null
          status: string
          transaction_hash: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          transaction_hash?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          transaction_hash?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      xrp_fixed_addresses: {
        Row: {
          active: boolean | null
          address: string
          created_at: string | null
          id: string
          network: string
        }
        Insert: {
          active?: boolean | null
          address: string
          created_at?: string | null
          id?: string
          network: string
        }
        Update: {
          active?: boolean | null
          address?: string
          created_at?: string | null
          id?: string
          network?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_chain_configs: {
        Row: {
          active: boolean | null
          asset: string | null
          chain: string | null
          config: Json | null
          created_at: string | null
          deposit_enabled: boolean | null
          id: string | null
          min_confirmations: number | null
          min_deposit: number | null
          network: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          asset?: string | null
          chain?: string | null
          config?: Json | null
          created_at?: string | null
          deposit_enabled?: boolean | null
          id?: string | null
          min_confirmations?: number | null
          min_deposit?: number | null
          network?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          asset?: string | null
          chain?: string | null
          config?: Json | null
          created_at?: string | null
          deposit_enabled?: boolean | null
          id?: string | null
          min_confirmations?: number | null
          min_deposit?: number | null
          network?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_balances_view: {
        Row: {
          available: number | null
          currency: string | null
          locked: number | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_deposit_summary: {
        Row: {
          amount: number | null
          asset: string | null
          asset_symbol: string | null
          chain: string | null
          chain_active: boolean | null
          chain_name: string | null
          confirmations_observed: number | null
          confirmations_required: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          currency: string | null
          explorer_url: string | null
          fully_confirmed: boolean | null
          id: string | null
          memo_tag: string | null
          network: string | null
          notes: string | null
          status: string | null
          transaction_hash: string | null
          user_id: string | null
          wallet_address: string | null
        }
        Relationships: []
      }
      v_user_kyc_status: {
        Row: {
          approved_documents: number | null
          document_count: number | null
          email: string | null
          full_name: string | null
          kyc_level: number | null
          kyc_notes: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"] | null
          kyc_updated_at: string | null
          pending_documents: number | null
          rejected_documents: number | null
          user_id: string | null
        }
        Relationships: []
      }
      webhook_errors_summary: {
        Row: {
          avg_resolution_time_seconds: number | null
          chain: string | null
          error_count: number | null
          error_date: string | null
          error_type: string | null
          network: string | null
          resolved_count: number | null
          unresolved_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _get_market: {
        Args: { p_market: string }
        Returns: {
          base: string
          id: string
          maker_fee_rate: number
          min_notional: number
          price_tick: number
          qty_step: number
          quote: string
          taker_fee_rate: number
        }[]
      }
      add_currency_to_all_users: {
        Args:
          | { p_currency: string }
          | { p_currency: string; p_initial_balance?: number }
        Returns: number
      }
      add_user_asset: {
        Args: {
          p_currency: string
          p_initial_balance?: number
          p_user_id: string
        }
        Returns: boolean
      }
      calculate_conversion_fee: {
        Args: {
          p_from_amount: number
          p_from_currency: string
          p_to_currency: string
        }
        Returns: {
          fee_amount: number
          fee_percentage: number
          net_amount: number
        }[]
      }
      cancel_all_orders: {
        Args: { p_market?: string }
        Returns: number
      }
      cancel_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      execute_conversion: {
        Args: {
          p_exchange_rate: number
          p_from_amount: number
          p_from_currency: string
          p_to_amount: number
          p_to_currency: string
          p_user_id: string
        }
        Returns: boolean
      }
      execute_conversion_with_fee: {
        Args: {
          p_exchange_rate: number
          p_from_amount: number
          p_from_currency: string
          p_to_amount: number
          p_to_currency: string
          p_user_id: string
        }
        Returns: Json
      }
      execute_market_order: {
        Args: {
          p_market: string
          p_side: string
          p_qty: number
          p_price: number
        }
        Returns: string
      }
      generate_user_handle: {
        Args: { p_base_name?: string; p_user_id?: string }
        Returns: string
      }
      get_active_wallet_root: {
        Args: { p_asset: string; p_chain: string; p_network: string }
        Returns: {
          auto_generated: boolean
          derivation_path: string
          id: string
          legacy_data: boolean
          master_key_id: string
          xpub: string
        }[]
      }
      get_conversion_fee_info: {
        Args: { p_from_currency?: string; p_to_currency?: string }
        Returns: {
          fee_percentage: number
          from_currency: string
          maximum_fee: number
          minimum_fee: number
          to_currency: string
        }[]
      }
      get_dev_auth_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          daily_limit: number
          feature_name: string
          is_enabled: boolean
          last_used: string
          usage_today: number
        }[]
      }
      get_my_trades: {
        Args:
          | {
              p_from?: string
              p_limit?: number
              p_offset?: number
              p_to?: string
            }
          | { p_limit?: number }
        Returns: {
          created_at: string
          id: string
          market: string
          price: number
          qty: number
          role: string
          side: string
        }[]
      }
      get_orderbook_levels: {
        Args: { p_limit?: number; p_market: string; p_side: string }
        Returns: {
          amount: number
          price: number
        }[]
      }
      get_user_conversion_history: {
        Args: { p_limit?: number; p_user_id: string } | { p_user_id: string }
        Returns: {
          created_at: string
          exchange_rate: number
          from_amount: number
          from_currency: string
          id: string
          status: string
          to_amount: number
          to_currency: string
        }[]
      }
      get_user_kyc_status: {
        Args: { target_user_id: string }
        Returns: Database["public"]["Enums"]["kyc_status"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_kyc_verified: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      kyc_required: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      mark_all_notifications_as_read: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      mark_notification_as_read: {
        Args: { notification_id: string }
        Returns: boolean
      }
      place_limit_order: {
        Args: {
          p_client_id?: string
          p_market: string
          p_price: number
          p_qty: number
          p_side: string
          p_time_in_force?: string
        }
        Returns: string
      }
      request_withdrawal: {
        Args: {
          p_amount: number
          p_currency: string
          p_memo?: string
          p_network?: string
          p_wallet_address: string
        }
        Returns: string
      }
      requesting_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search_public_profiles: {
        Args: { p_query: string }
        Returns: {
          display_name: string
          email: string
          full_name: string
          profile_id: string
          user_handle: string
        }[]
      }
      toggle_dev_auth: {
        Args: { p_enabled: boolean; p_feature_name: string; p_reason?: string }
        Returns: boolean
      }
      transfer_funds: {
        Args: {
          p_amount: number
          p_currency: string
          p_description?: string
          p_to_user_identifier: string
        }
        Returns: Json
      }
      update_personal_profile: {
        Args: {
          p_address: string | null
          p_birth_date: string | null
          p_building: string | null
          p_city: string | null
          p_first_name: string | null
          p_first_name_kana: string | null
          p_last_name: string | null
          p_last_name_kana: string | null
          p_postal_code: string | null
          p_prefecture: string | null
        }
        Returns: undefined
      }
      upsert_user_asset: {
        Args: { p_amount: number; p_currency: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kyc_status: "none" | "pending" | "verified" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      kyc_status: ["none", "pending", "verified", "rejected"],
    },
  },
} as const
