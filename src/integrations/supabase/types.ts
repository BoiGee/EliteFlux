export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      admin_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json | null
          id: string
          target_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      alert_deliveries: {
        Row: {
          alert_id: string | null
          channel: Database["public"]["Enums"]["alert_channel"]
          created_at: string
          error: string | null
          history_id: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          channel: Database["public"]["Enums"]["alert_channel"]
          created_at?: string
          error?: string | null
          history_id?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          alert_id?: string | null
          channel?: Database["public"]["Enums"]["alert_channel"]
          created_at?: string
          error?: string | null
          history_id?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_deliveries_history_id_fkey"
            columns: ["history_id"]
            isOneToOne: false
            referencedRelation: "alert_history"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_history: {
        Row: {
          alert_id: string
          fired_at: string
          id: string
          payload: Json | null
          read: boolean
          user_id: string
        }
        Insert: {
          alert_id: string
          fired_at?: string
          id?: string
          payload?: Json | null
          read?: boolean
          user_id: string
        }
        Update: {
          alert_id?: string
          fired_at?: string
          id?: string
          payload?: Json | null
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          channels: Database["public"]["Enums"]["alert_channel"][]
          created_at: string
          direction: string | null
          enabled: boolean
          id: string
          last_triggered_at: string | null
          name: string
          symbol: string | null
          threshold: number | null
          trigger_type: Database["public"]["Enums"]["alert_trigger"]
          user_id: string
        }
        Insert: {
          channels?: Database["public"]["Enums"]["alert_channel"][]
          created_at?: string
          direction?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          name: string
          symbol?: string | null
          threshold?: number | null
          trigger_type: Database["public"]["Enums"]["alert_trigger"]
          user_id: string
        }
        Update: {
          channels?: Database["public"]["Enums"]["alert_channel"][]
          created_at?: string
          direction?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          name?: string
          symbol?: string | null
          threshold?: number | null
          trigger_type?: Database["public"]["Enums"]["alert_trigger"]
          user_id?: string
        }
        Relationships: []
      }
      autopilot_actions: {
        Row: {
          blocked_reason: string | null
          conviction: number | null
          created_at: string
          decided_at: string | null
          executed_at: string | null
          executing_since: string | null
          expires_at: string | null
          guardrail_verdict: Json | null
          id: string
          kind: Database["public"]["Enums"]["action_kind"]
          notional_usd: number | null
          order_result: Json | null
          paper: boolean
          rationale: string
          reference_price: number | null
          size_pct: number | null
          state: Database["public"]["Enums"]["action_state"]
          symbol: string
          user_id: string
          venue: Database["public"]["Enums"]["exchange_venue"] | null
        }
        Insert: {
          blocked_reason?: string | null
          conviction?: number | null
          created_at?: string
          decided_at?: string | null
          executed_at?: string | null
          executing_since?: string | null
          expires_at?: string | null
          guardrail_verdict?: Json | null
          id?: string
          kind: Database["public"]["Enums"]["action_kind"]
          notional_usd?: number | null
          order_result?: Json | null
          paper?: boolean
          rationale: string
          reference_price?: number | null
          size_pct?: number | null
          state?: Database["public"]["Enums"]["action_state"]
          symbol: string
          user_id: string
          venue?: Database["public"]["Enums"]["exchange_venue"] | null
        }
        Update: {
          blocked_reason?: string | null
          conviction?: number | null
          created_at?: string
          decided_at?: string | null
          executed_at?: string | null
          executing_since?: string | null
          expires_at?: string | null
          guardrail_verdict?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["action_kind"]
          notional_usd?: number | null
          order_result?: Json | null
          paper?: boolean
          rationale?: string
          reference_price?: number | null
          size_pct?: number | null
          state?: Database["public"]["Enums"]["action_state"]
          symbol?: string
          user_id?: string
          venue?: Database["public"]["Enums"]["exchange_venue"] | null
        }
        Relationships: []
      }
      autopilot_audit: {
        Row: {
          action_id: string | null
          created_at: string
          detail: Json | null
          event: string
          id: string
          user_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          detail?: Json | null
          event: string
          id?: string
          user_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          detail?: Json | null
          event?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_audit_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "autopilot_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_settings: {
        Row: {
          allowed_symbols: string[]
          armed: boolean
          armed_at: string | null
          blocked_symbols: string[]
          cooldown_hours: number
          created_at: string
          disarmed_reason: string | null
          disclosure_accepted_at: string | null
          drawdown_breaker_pct: number
          kill_switch: boolean
          level: Database["public"]["Enums"]["autonomy_level"]
          max_daily_usd: number
          max_trade_pct: number
          max_trade_usd: number
          max_trades_per_day: number
          min_conviction: number
          paper_mode: boolean
          peak_portfolio_usd: number | null
          stable_symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_symbols?: string[]
          armed?: boolean
          armed_at?: string | null
          blocked_symbols?: string[]
          cooldown_hours?: number
          created_at?: string
          disarmed_reason?: string | null
          disclosure_accepted_at?: string | null
          drawdown_breaker_pct?: number
          kill_switch?: boolean
          level?: Database["public"]["Enums"]["autonomy_level"]
          max_daily_usd?: number
          max_trade_pct?: number
          max_trade_usd?: number
          max_trades_per_day?: number
          min_conviction?: number
          paper_mode?: boolean
          peak_portfolio_usd?: number | null
          stable_symbol?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_symbols?: string[]
          armed?: boolean
          armed_at?: string | null
          blocked_symbols?: string[]
          cooldown_hours?: number
          created_at?: string
          disarmed_reason?: string | null
          disclosure_accepted_at?: string | null
          drawdown_breaker_pct?: number
          kill_switch?: boolean
          level?: Database["public"]["Enums"]["autonomy_level"]
          max_daily_usd?: number
          max_trade_pct?: number
          max_trade_usd?: number
          max_trades_per_day?: number
          min_conviction?: number
          paper_mode?: boolean
          peak_portfolio_usd?: number | null
          stable_symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_calls: {
        Row: {
          created_at: string
          entry_price: number
          exit_price: number | null
          flux_at_call: number | null
          grade: string | null
          graded_at: string | null
          horizon_hours: number
          id: string
          move_pct: number | null
          rationale: string | null
          regime_at_call: string | null
          score: number | null
          source: Database["public"]["Enums"]["call_source"]
          stance: Database["public"]["Enums"]["call_stance"]
          status: Database["public"]["Enums"]["call_status"]
          symbol: string
          thread_id: string | null
          user_id: string
          verdict: string | null
        }
        Insert: {
          created_at?: string
          entry_price: number
          exit_price?: number | null
          flux_at_call?: number | null
          grade?: string | null
          graded_at?: string | null
          horizon_hours?: number
          id?: string
          move_pct?: number | null
          rationale?: string | null
          regime_at_call?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["call_source"]
          stance: Database["public"]["Enums"]["call_stance"]
          status?: Database["public"]["Enums"]["call_status"]
          symbol: string
          thread_id?: string | null
          user_id: string
          verdict?: string | null
        }
        Update: {
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          flux_at_call?: number | null
          grade?: string | null
          graded_at?: string | null
          horizon_hours?: number
          id?: string
          move_pct?: number | null
          rationale?: string | null
          regime_at_call?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["call_source"]
          stance?: Database["public"]["Enums"]["call_stance"]
          status?: Database["public"]["Enums"]["call_status"]
          symbol?: string
          thread_id?: string | null
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_calls_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coach_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_memory: {
        Row: {
          created_at: string
          fact: string
          id: string
          source_thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fact: string
          id?: string
          source_thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fact?: string
          id?: string
          source_thread_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coach_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_nudges: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read?: boolean
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_profile: {
        Row: {
          behavior: Json
          created_at: string
          experience_level: Database["public"]["Enums"]["coach_level"]
          goals: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior?: Json
          created_at?: string
          experience_level?: Database["public"]["Enums"]["coach_level"]
          goals?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior?: Json
          created_at?: string
          experience_level?: Database["public"]["Enums"]["coach_level"]
          goals?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_usage: {
        Row: {
          day: string
          id: string
          messages: number
          user_id: string
        }
        Insert: {
          day?: string
          id?: string
          messages?: number
          user_id: string
        }
        Update: {
          day?: string
          id?: string
          messages?: number
          user_id?: string
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          api_key_ciphertext: string
          api_secret_ciphertext: string
          created_at: string
          id: string
          key_hint: string | null
          label: string | null
          last_error: string | null
          last_synced_at: string | null
          passphrase_ciphertext: string | null
          permission: Database["public"]["Enums"]["exchange_permission"]
          status: string
          updated_at: string
          user_id: string
          venue: Database["public"]["Enums"]["exchange_venue"]
        }
        Insert: {
          api_key_ciphertext: string
          api_secret_ciphertext: string
          created_at?: string
          id?: string
          key_hint?: string | null
          label?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          passphrase_ciphertext?: string | null
          permission?: Database["public"]["Enums"]["exchange_permission"]
          status?: string
          updated_at?: string
          user_id: string
          venue: Database["public"]["Enums"]["exchange_venue"]
        }
        Update: {
          api_key_ciphertext?: string
          api_secret_ciphertext?: string
          created_at?: string
          id?: string
          key_hint?: string | null
          label?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          passphrase_ciphertext?: string | null
          permission?: Database["public"]["Enums"]["exchange_permission"]
          status?: string
          updated_at?: string
          user_id?: string
          venue?: Database["public"]["Enums"]["exchange_venue"]
        }
        Relationships: []
      }
      market_snapshots: {
        Row: {
          captured_at: string
          coins: Json
          exit_pressure: number | null
          flux_score: number | null
          id: string
          ignition_score: number | null
          regime: string | null
          sentiment_score: number | null
          whale_score: number | null
        }
        Insert: {
          captured_at?: string
          coins?: Json
          exit_pressure?: number | null
          flux_score?: number | null
          id?: string
          ignition_score?: number | null
          regime?: string | null
          sentiment_score?: number | null
          whale_score?: number | null
        }
        Update: {
          captured_at?: string
          coins?: Json
          exit_pressure?: number | null
          flux_score?: number | null
          id?: string
          ignition_score?: number | null
          regime?: string | null
          sentiment_score?: number | null
          whale_score?: number | null
        }
        Relationships: []
      }
      model_weights: {
        Row: {
          computed_at: string
          id: string
          model: string
          sample_size: number
          weights: Json
        }
        Insert: {
          computed_at?: string
          id?: string
          model: string
          sample_size?: number
          weights: Json
        }
        Update: {
          computed_at?: string
          id?: string
          model?: string
          sample_size?: number
          weights?: Json
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          created_at: string
          cycle: Database["public"]["Enums"]["billing_cycle"]
          detected_amount: number | null
          expected_amount: number
          from_address: string | null
          id: string
          notes: string | null
          provider: string
          provider_data: Json | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          to_address: string | null
          tron_data: Json | null
          txid: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          cycle: Database["public"]["Enums"]["billing_cycle"]
          detected_amount?: number | null
          expected_amount: number
          from_address?: string | null
          id?: string
          notes?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          to_address?: string | null
          tron_data?: Json | null
          txid?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          cycle?: Database["public"]["Enums"]["billing_cycle"]
          detected_amount?: number | null
          expected_amount?: number
          from_address?: string | null
          id?: string
          notes?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          to_address?: string | null
          tron_data?: Json | null
          txid?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          amount: number
          id: string
          price: number | null
          source: Database["public"]["Enums"]["holding_source"]
          source_id: string | null
          source_label: string | null
          symbol: string
          synced_at: string
          usd_value: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          amount?: number
          id?: string
          price?: number | null
          source: Database["public"]["Enums"]["holding_source"]
          source_id?: string | null
          source_label?: string | null
          symbol: string
          synced_at?: string
          usd_value?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          amount?: number
          id?: string
          price?: number | null
          source?: Database["public"]["Enums"]["holding_source"]
          source_id?: string | null
          source_label?: string | null
          symbol?: string
          synced_at?: string
          usd_value?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_active_at: string | null
          onboarded_at: string | null
          readonly_keys_only: boolean
          risk_sensitivity: Database["public"]["Enums"]["risk_sensitivity"]
          telegram_chat_id: string | null
          telegram_handle: string | null
          telegram_user_id: string | null
          timezone: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_active_at?: string | null
          onboarded_at?: string | null
          readonly_keys_only?: boolean
          risk_sensitivity?: Database["public"]["Enums"]["risk_sensitivity"]
          telegram_chat_id?: string | null
          telegram_handle?: string | null
          telegram_user_id?: string | null
          timezone?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_active_at?: string | null
          onboarded_at?: string | null
          readonly_keys_only?: boolean
          risk_sensitivity?: Database["public"]["Enums"]["risk_sensitivity"]
          telegram_chat_id?: string | null
          telegram_handle?: string | null
          telegram_user_id?: string | null
          timezone?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          id: string
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          id?: string
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          id?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      signal_events: {
        Row: {
          band: string | null
          confidence: number | null
          context: Json
          fired_at: string
          id: string
          reference_price: number | null
          regime: string | null
          resolved_at: string | null
          score: number
          signal_type: string
          symbol: string | null
        }
        Insert: {
          band?: string | null
          confidence?: number | null
          context?: Json
          fired_at?: string
          id?: string
          reference_price?: number | null
          regime?: string | null
          resolved_at?: string | null
          score: number
          signal_type: string
          symbol?: string | null
        }
        Update: {
          band?: string | null
          confidence?: number | null
          context?: Json
          fired_at?: string
          id?: string
          reference_price?: number | null
          regime?: string | null
          resolved_at?: string | null
          score?: number
          signal_type?: string
          symbol?: string | null
        }
        Relationships: []
      }
      signal_outcomes: {
        Row: {
          entry_price: number | null
          event_id: string
          exit_price: number | null
          forward_return_pct: number | null
          hit: boolean | null
          horizon_hours: number
          id: string
          regime: string | null
          resolved_at: string
          score: number | null
          signal_type: string
          symbol: string | null
        }
        Insert: {
          entry_price?: number | null
          event_id: string
          exit_price?: number | null
          forward_return_pct?: number | null
          hit?: boolean | null
          horizon_hours: number
          id?: string
          regime?: string | null
          resolved_at?: string
          score?: number | null
          signal_type: string
          symbol?: string | null
        }
        Update: {
          entry_price?: number | null
          event_id?: string
          exit_price?: number | null
          forward_return_pct?: number | null
          hit?: boolean | null
          horizon_hours?: number
          id?: string
          regime?: string | null
          resolved_at?: string
          score?: number | null
          signal_type?: string
          symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "signal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      stablecoin_supply_history: {
        Row: {
          captured_at: string
          id: string
          symbol: string
          total_supply: number
        }
        Insert: {
          captured_at?: string
          id?: string
          symbol: string
          total_supply: number
        }
        Update: {
          captured_at?: string
          id?: string
          symbol?: string
          total_supply?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          paystack_authorization_code: string | null
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          provider: string
          status: Database["public"]["Enums"]["subscription_status"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paystack_authorization_code?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          paystack_authorization_code?: string | null
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_runs: {
        Row: {
          detail: Json | null
          errors: number
          evaluated: number
          finished_at: string | null
          fired: number
          id: string
          job: string
          started_at: string
          status: string
        }
        Insert: {
          detail?: Json | null
          errors?: number
          evaluated?: number
          finished_at?: string | null
          fired?: number
          id?: string
          job: string
          started_at?: string
          status?: string
        }
        Update: {
          detail?: Json | null
          errors?: number
          evaluated?: number
          finished_at?: string | null
          fired?: number
          id?: string
          job?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      telegram_login_attempts: {
        Row: {
          created_at: string
          payload_hash: string
        }
        Insert: {
          created_at?: string
          payload_hash: string
        }
        Update: {
          created_at?: string
          payload_hash?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          id: string
          rating: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: string
          subject_id?: string
          subject_type?: string
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
      volatility_history: {
        Row: {
          captured_at: string
          id: string
          range_pct: number
          symbol: string
        }
        Insert: {
          captured_at?: string
          id?: string
          range_pct: number
          symbol: string
        }
        Update: {
          captured_at?: string
          id?: string
          range_pct?: number
          symbol?: string
        }
        Relationships: []
      }
      wallet_addresses: {
        Row: {
          address: string
          chain: Database["public"]["Enums"]["wallet_chain"]
          created_at: string
          id: string
          label: string | null
          last_error: string | null
          last_synced_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          address: string
          chain: Database["public"]["Enums"]["wallet_chain"]
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: Database["public"]["Enums"]["wallet_chain"]
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          added_at: string
          coin_name: string | null
          id: string
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          coin_name?: string | null
          id?: string
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          coin_name?: string | null
          id?: string
          symbol?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tier: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      action_kind: "buy" | "trim" | "exit" | "hold"
      action_state:
        | "proposed"
        | "approved"
        | "rejected"
        | "executed"
        | "failed"
        | "expired"
        | "blocked"
        | "unknown"
      alert_channel: "in_app" | "email" | "telegram" | "webhook"
      alert_trigger:
        | "flux_score"
        | "whale_spike"
        | "sentiment_shift"
        | "narrative_surge"
        | "exit_pressure"
        | "momentum_change"
        | "price_threshold"
      app_role: "admin" | "moderator" | "user" | "owner"
      autonomy_level: "observe" | "advise" | "approve" | "autopilot"
      billing_cycle: "monthly" | "yearly"
      call_source: "coach" | "user"
      call_stance: "accumulate" | "reduce" | "watch" | "avoid"
      call_status: "open" | "graded" | "expired"
      coach_level: "beginner" | "intermediate" | "advanced" | "pro"
      exchange_permission: "read_only" | "read_trade"
      exchange_venue: "binance" | "bybit" | "okx" | "gateio" | "kucoin" | "mexc"
      holding_source: "exchange" | "wallet" | "manual"
      payment_status: "pending" | "verified" | "rejected" | "expired"
      risk_sensitivity: "low" | "medium" | "high"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "incomplete"
        | "expired"
      subscription_tier: "free" | "pro" | "elite"
      wallet_chain: "evm" | "solana"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      action_kind: ["buy", "trim", "exit", "hold"],
      action_state: [
        "proposed",
        "approved",
        "rejected",
        "executed",
        "failed",
        "expired",
        "blocked",
        "unknown",
      ],
      alert_channel: ["in_app", "email", "telegram", "webhook"],
      alert_trigger: [
        "flux_score",
        "whale_spike",
        "sentiment_shift",
        "narrative_surge",
        "exit_pressure",
        "momentum_change",
        "price_threshold",
      ],
      app_role: ["admin", "moderator", "user", "owner"],
      autonomy_level: ["observe", "advise", "approve", "autopilot"],
      billing_cycle: ["monthly", "yearly"],
      call_source: ["coach", "user"],
      call_stance: ["accumulate", "reduce", "watch", "avoid"],
      call_status: ["open", "graded", "expired"],
      coach_level: ["beginner", "intermediate", "advanced", "pro"],
      exchange_permission: ["read_only", "read_trade"],
      exchange_venue: ["binance", "bybit", "okx", "gateio", "kucoin", "mexc"],
      holding_source: ["exchange", "wallet", "manual"],
      payment_status: ["pending", "verified", "rejected", "expired"],
      risk_sensitivity: ["low", "medium", "high"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "trialing",
        "incomplete",
        "expired",
      ],
      subscription_tier: ["free", "pro", "elite"],
      wallet_chain: ["evm", "solana"],
    },
  },
} as const
