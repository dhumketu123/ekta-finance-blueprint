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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_code: string
          account_type: Database["public"]["Enums"]["account_type"]
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_bn: string
          parent_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_code: string
          account_type: Database["public"]["Enums"]["account_type"]
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string
          parent_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_type?: Database["public"]["Enums"]["account_type"]
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string
          parent_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      advance_buffer: {
        Row: {
          amount: number
          buffer_type: string
          client_id: string
          created_at: string
          id: string
          loan_id: string | null
          notes: string | null
          post_date: string
          posted_at: string | null
          posted_by: string | null
          savings_id: string | null
          source_transaction_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          buffer_type?: string
          client_id: string
          created_at?: string
          id?: string
          loan_id?: string | null
          notes?: string | null
          post_date: string
          posted_at?: string | null
          posted_by?: string | null
          savings_id?: string | null
          source_transaction_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buffer_type?: string
          client_id?: string
          created_at?: string
          id?: string
          loan_id?: string | null
          notes?: string | null
          post_date?: string
          posted_at?: string | null
          posted_by?: string | null
          savings_id?: string | null
          source_transaction_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_buffer_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_buffer_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "advance_buffer_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_buffer_savings_id_fkey"
            columns: ["savings_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_buffer_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          branch_id: string | null
          created_at: string
          details: Json | null
          device_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          previous_value: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_bn: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_risk: {
        Row: {
          client_id: string
          created_at: string
          flagged_at: string
          id: string
          notes: string | null
          overdue_frequency: number
          probability_score: number
          reschedule_count_30d: number
          resolved_at: string | null
          resolved_by: string | null
          risk_level: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          flagged_at?: string
          id?: string
          notes?: string | null
          overdue_frequency?: number
          probability_score?: number
          reschedule_count_30d?: number
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          flagged_at?: string
          id?: string
          notes?: string | null
          overdue_frequency?: number
          probability_score?: number
          reschedule_count_30d?: number
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          area: string | null
          assigned_officer: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          district: string | null
          father_or_husband_name: string | null
          id: string
          loan_amount: number | null
          loan_product_id: string | null
          marital_status: string | null
          member_id: string | null
          mother_name: string | null
          name_bn: string
          name_en: string
          next_payment_date: string | null
          nid_number: string | null
          nominee_name: string | null
          nominee_nid: string | null
          nominee_phone: string | null
          nominee_relation: string | null
          occupation: string | null
          phone: string | null
          photo_url: string | null
          post_office: string | null
          savings_product_id: string | null
          serial_number: number | null
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          union_name: string | null
          upazila: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          area?: string | null
          assigned_officer?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          district?: string | null
          father_or_husband_name?: string | null
          id?: string
          loan_amount?: number | null
          loan_product_id?: string | null
          marital_status?: string | null
          member_id?: string | null
          mother_name?: string | null
          name_bn?: string
          name_en: string
          next_payment_date?: string | null
          nid_number?: string | null
          nominee_name?: string | null
          nominee_nid?: string | null
          nominee_phone?: string | null
          nominee_relation?: string | null
          occupation?: string | null
          phone?: string | null
          photo_url?: string | null
          post_office?: string | null
          savings_product_id?: string | null
          serial_number?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          union_name?: string | null
          upazila?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          area?: string | null
          assigned_officer?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          district?: string | null
          father_or_husband_name?: string | null
          id?: string
          loan_amount?: number | null
          loan_product_id?: string | null
          marital_status?: string | null
          member_id?: string | null
          mother_name?: string | null
          name_bn?: string
          name_en?: string
          next_payment_date?: string | null
          nid_number?: string | null
          nominee_name?: string | null
          nominee_nid?: string | null
          nominee_phone?: string | null
          nominee_relation?: string | null
          occupation?: string | null
          phone?: string | null
          photo_url?: string | null
          post_office?: string | null
          savings_product_id?: string | null
          serial_number?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          union_name?: string | null
          upazila?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_loan_product_id_fkey"
            columns: ["loan_product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_savings_product_id_fkey"
            columns: ["savings_product_id"]
            isOneToOne: false
            referencedRelation: "savings_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_analytics: {
        Row: {
          action_metadata: Json | null
          action_type: string
          commitment_id: string | null
          created_at: string
          device_info: string | null
          id: string
          user_id: string
        }
        Insert: {
          action_metadata?: Json | null
          action_type: string
          commitment_id?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action_metadata?: Json | null
          action_type?: string
          commitment_id?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_analytics_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_analytics_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "view_reschedule_prediction_input"
            referencedColumns: ["commitment_id"]
          },
        ]
      }
      commitments: {
        Row: {
          audit_hash_signature: string | null
          client_id: string
          commitment_date: string
          created_at: string
          id: string
          officer_id: string
          penalty_suspended: boolean
          reschedule_reason: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          updated_at: string
        }
        Insert: {
          audit_hash_signature?: string | null
          client_id: string
          commitment_date: string
          created_at?: string
          id?: string
          officer_id: string
          penalty_suspended?: boolean
          reschedule_reason?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
        }
        Update: {
          audit_hash_signature?: string | null
          client_id?: string
          commitment_date?: string
          created_at?: string
          id?: string
          officer_id?: string
          penalty_suspended?: boolean
          reschedule_reason?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          client_id: string
          comm_type: string
          created_at: string
          id: string
          loan_id: string | null
          message_text: string | null
          template_used: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          comm_type: string
          created_at?: string
          id?: string
          loan_id?: string | null
          message_text?: string | null
          template_used?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          comm_type?: string
          created_at?: string
          id?: string
          loan_id?: string | null
          message_text?: string | null
          template_used?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "communication_logs_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_scores: {
        Row: {
          avg_days_late: number | null
          client_id: string
          created_at: string
          factors: Json | null
          id: string
          last_calculated_at: string
          overdue_frequency: number | null
          payment_regularity: number | null
          risk_level: string
          score: number
          total_late_payments: number | null
          total_on_time_payments: number | null
          updated_at: string
        }
        Insert: {
          avg_days_late?: number | null
          client_id: string
          created_at?: string
          factors?: Json | null
          id?: string
          last_calculated_at?: string
          overdue_frequency?: number | null
          payment_regularity?: number | null
          risk_level?: string
          score?: number
          total_late_payments?: number | null
          total_on_time_payments?: number | null
          updated_at?: string
        }
        Update: {
          avg_days_late?: number | null
          client_id?: string
          created_at?: string
          factors?: Json | null
          id?: string
          last_calculated_at?: string
          overdue_frequency?: number | null
          payment_regularity?: number | null
          risk_level?: string
          score?: number
          total_late_payments?: number | null
          total_on_time_payments?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_financial_summary: {
        Row: {
          created_at: string
          id: string
          summary_date: string
          total_collection: number
          total_disbursement: number
          total_interest_collected: number
          total_penalty: number
          total_savings_deposit: number
          total_savings_withdrawal: number
          total_transactions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          summary_date: string
          total_collection?: number
          total_disbursement?: number
          total_interest_collected?: number
          total_penalty?: number
          total_savings_deposit?: number
          total_savings_withdrawal?: number
          total_transactions?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          summary_date?: string
          total_collection?: number
          total_disbursement?: number
          total_interest_collected?: number
          total_penalty?: number
          total_savings_deposit?: number
          total_savings_withdrawal?: number
          total_transactions?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_sourcing: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          hash_prev: string | null
          hash_self: string | null
          id: string
          payload: Json
          performed_by: string | null
          snapshot_after: Json | null
          snapshot_before: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          payload?: Json
          performed_by?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          payload?: Json
          performed_by?: string | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
        }
        Relationships: []
      }
      executive_reports: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          period_end: string
          period_start: string
          report_data: Json
          report_type: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          period_end: string
          period_start: string
          report_data?: Json
          report_type?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          period_end?: string
          period_start?: string
          report_data?: Json
          report_type?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled_for_role: string
          feature_name: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled_for_role?: string
          feature_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled_for_role?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          allocation_breakdown: Json | null
          amount: number
          approval_status: Database["public"]["Enums"]["approval_status"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          manual_flag: boolean
          member_id: string | null
          notes: string | null
          receipt_number: string | null
          receipt_snapshot: Json | null
          reference_id: string | null
          rejection_reason: string | null
          running_balance: Json | null
          transaction_type: Database["public"]["Enums"]["fin_transaction_type"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          allocation_breakdown?: Json | null
          amount: number
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          manual_flag?: boolean
          member_id?: string | null
          notes?: string | null
          receipt_number?: string | null
          receipt_snapshot?: Json | null
          reference_id?: string | null
          rejection_reason?: string | null
          running_balance?: Json | null
          transaction_type: Database["public"]["Enums"]["fin_transaction_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          allocation_breakdown?: Json | null
          amount?: number
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          manual_flag?: boolean
          member_id?: string | null
          notes?: string | null
          receipt_number?: string | null
          receipt_snapshot?: Json | null
          reference_id?: string | null
          rejection_reason?: string | null
          running_balance?: Json | null
          transaction_type?: Database["public"]["Enums"]["fin_transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_weekly_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          investor_id: string
          notes: string | null
          tenant_id: string
          transaction_date: string
          type: string
          weeks_covered: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          investor_id: string
          notes?: string | null
          tenant_id: string
          transaction_date?: string
          type: string
          weeks_covered?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          investor_id?: string
          notes?: string | null
          tenant_id?: string
          transaction_date?: string
          type?: string
          weeks_covered?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_weekly_transactions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_weekly_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          accumulated_profit: number
          address: string | null
          capital: number
          created_at: string
          deleted_at: string | null
          due_dividend: number
          id: string
          investment_model: Database["public"]["Enums"]["investment_model"]
          investor_id: string | null
          last_profit_date: string | null
          maturity_date: string | null
          monthly_profit_percent: number
          name_bn: string
          name_en: string
          nid_number: string | null
          nominee_name: string | null
          nominee_nid: string | null
          nominee_phone: string | null
          nominee_relation: string | null
          phone: string | null
          principal_amount: number
          reinvest: boolean
          risk_flag: boolean
          serial_number: number | null
          source_of_fund: string | null
          status: Database["public"]["Enums"]["investor_status"]
          tenant_id: string
          tenure_years: number | null
          total_weekly_paid: number
          updated_at: string
          user_id: string | null
          weekly_paid_until: string | null
          weekly_share: number
        }
        Insert: {
          accumulated_profit?: number
          address?: string | null
          capital?: number
          created_at?: string
          deleted_at?: string | null
          due_dividend?: number
          id?: string
          investment_model?: Database["public"]["Enums"]["investment_model"]
          investor_id?: string | null
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en: string
          nid_number?: string | null
          nominee_name?: string | null
          nominee_nid?: string | null
          nominee_phone?: string | null
          nominee_relation?: string | null
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
          risk_flag?: boolean
          serial_number?: number | null
          source_of_fund?: string | null
          status?: Database["public"]["Enums"]["investor_status"]
          tenant_id: string
          tenure_years?: number | null
          total_weekly_paid?: number
          updated_at?: string
          user_id?: string | null
          weekly_paid_until?: string | null
          weekly_share?: number
        }
        Update: {
          accumulated_profit?: number
          address?: string | null
          capital?: number
          created_at?: string
          deleted_at?: string | null
          due_dividend?: number
          id?: string
          investment_model?: Database["public"]["Enums"]["investment_model"]
          investor_id?: string | null
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en?: string
          nid_number?: string | null
          nominee_name?: string | null
          nominee_nid?: string | null
          nominee_phone?: string | null
          nominee_relation?: string | null
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
          risk_flag?: boolean
          serial_number?: number | null
          source_of_fund?: string | null
          status?: Database["public"]["Enums"]["investor_status"]
          tenant_id?: string
          tenure_years?: number | null
          total_weekly_paid?: number
          updated_at?: string
          user_id?: string | null
          weekly_paid_until?: string | null
          weekly_share?: number
        }
        Relationships: [
          {
            foreignKeyName: "investors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          account_type: Database["public"]["Enums"]["account_type"]
          amount: number
          branch_id: string
          created_at: string
          created_by: string
          device_id: string | null
          entry_type: Database["public"]["Enums"]["entry_type"]
          hash_signature: string | null
          id: string
          ip_address: string | null
          is_reversal: boolean
          narration: string | null
          original_group_id: string | null
          previous_hash: string | null
          reference_id: string | null
          reference_type: string
          transaction_group_id: string
        }
        Insert: {
          account_id: string
          account_type: Database["public"]["Enums"]["account_type"]
          amount: number
          branch_id: string
          created_at?: string
          created_by: string
          device_id?: string | null
          entry_type: Database["public"]["Enums"]["entry_type"]
          hash_signature?: string | null
          id?: string
          ip_address?: string | null
          is_reversal?: boolean
          narration?: string | null
          original_group_id?: string | null
          previous_hash?: string | null
          reference_id?: string | null
          reference_type: string
          transaction_group_id: string
        }
        Update: {
          account_id?: string
          account_type?: Database["public"]["Enums"]["account_type"]
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string
          device_id?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"]
          hash_signature?: string | null
          id?: string
          ip_address?: string | null
          is_reversal?: boolean
          narration?: string | null
          original_group_id?: string | null
          previous_hash?: string | null
          reference_id?: string | null
          reference_type?: string
          transaction_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_products: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          interest_rate: number
          max_amount: number
          max_concurrent: number
          min_amount: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          product_name_bn: string
          product_name_en: string
          tenure_months: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          interest_rate?: number
          max_amount?: number
          max_concurrent?: number
          min_amount?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          product_name_bn?: string
          product_name_en: string
          tenure_months?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          interest_rate?: number
          max_amount?: number
          max_concurrent?: number
          min_amount?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          product_name_bn?: string
          product_name_en?: string
          tenure_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      loan_schedules: {
        Row: {
          client_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number
          interest_due: number
          interest_paid: number
          is_penalty_frozen: boolean
          loan_id: string
          notes: string | null
          paid_date: string | null
          penalty_due: number
          principal_due: number
          principal_paid: number
          promised_date: string | null
          promised_status: string
          snooze_count: number
          status: string
          total_due: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          interest_due?: number
          interest_paid?: number
          is_penalty_frozen?: boolean
          loan_id: string
          notes?: string | null
          paid_date?: string | null
          penalty_due?: number
          principal_due?: number
          principal_paid?: number
          promised_date?: string | null
          promised_status?: string
          snooze_count?: number
          status?: string
          total_due?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          interest_due?: number
          interest_paid?: number
          is_penalty_frozen?: boolean
          loan_id?: string
          notes?: string | null
          paid_date?: string | null
          penalty_due?: number
          principal_due?: number
          principal_paid?: number
          promised_date?: string | null
          promised_status?: string
          snooze_count?: number
          status?: string
          total_due?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_schedules_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "loan_schedules_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          assigned_officer: string | null
          client_id: string
          created_at: string
          deleted_at: string | null
          disbursement_date: string | null
          emi_amount: number
          id: string
          installment_anchor_date: string | null
          installment_day: number | null
          loan_id: string | null
          loan_model: Database["public"]["Enums"]["loan_model"]
          loan_product_id: string | null
          maturity_date: string | null
          next_due_date: string | null
          notes: string | null
          outstanding_interest: number
          outstanding_principal: number
          penalty_amount: number
          serial_number: number | null
          status: Database["public"]["Enums"]["loan_status"]
          tenant_id: string
          total_interest: number
          total_principal: number
          updated_at: string
        }
        Insert: {
          assigned_officer?: string | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          disbursement_date?: string | null
          emi_amount?: number
          id?: string
          installment_anchor_date?: string | null
          installment_day?: number | null
          loan_id?: string | null
          loan_model?: Database["public"]["Enums"]["loan_model"]
          loan_product_id?: string | null
          maturity_date?: string | null
          next_due_date?: string | null
          notes?: string | null
          outstanding_interest?: number
          outstanding_principal?: number
          penalty_amount?: number
          serial_number?: number | null
          status?: Database["public"]["Enums"]["loan_status"]
          tenant_id: string
          total_interest?: number
          total_principal?: number
          updated_at?: string
        }
        Update: {
          assigned_officer?: string | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          disbursement_date?: string | null
          emi_amount?: number
          id?: string
          installment_anchor_date?: string | null
          installment_day?: number | null
          loan_id?: string | null
          loan_model?: Database["public"]["Enums"]["loan_model"]
          loan_product_id?: string | null
          maturity_date?: string | null
          next_due_date?: string | null
          notes?: string | null
          outstanding_interest?: number
          outstanding_principal?: number
          penalty_amount?: number
          serial_number?: number | null
          status?: Database["public"]["Enums"]["loan_status"]
          tenant_id?: string
          total_interest?: number
          total_principal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_loan_product_id_fkey"
            columns: ["loan_product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_ledger: {
        Row: {
          account_code: Database["public"]["Enums"]["account_code"]
          created_at: string
          credit_amount: number
          debit_amount: number
          id: string
          member_id: string | null
          narration: string | null
          transaction_id: string
        }
        Insert: {
          account_code: Database["public"]["Enums"]["account_code"]
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          id?: string
          member_id?: string | null
          narration?: string | null
          transaction_id: string
        }
        Update: {
          account_code?: Database["public"]["Enums"]["account_code"]
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          id?: string
          member_id?: string | null
          narration?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: string
          client_id: string | null
          created_at: string
          delivery_status: string
          error_message: string | null
          event_date: string
          event_type: string
          id: string
          installment_number: number | null
          loan_id: string | null
          message_bn: string
          message_en: string
          recipient_name: string | null
          recipient_phone: string | null
          retry_count: number
          sent_at: string | null
        }
        Insert: {
          channel?: string
          client_id?: string | null
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          event_date?: string
          event_type: string
          id?: string
          installment_number?: number | null
          loan_id?: string | null
          message_bn?: string
          message_en?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          retry_count?: number
          sent_at?: string | null
        }
        Update: {
          channel?: string
          client_id?: string | null
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          event_date?: string
          event_type?: string
          id?: string
          installment_number?: number | null
          loan_id?: string | null
          message_bn?: string
          message_en?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          retry_count?: number
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "notification_logs_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          deleted_at: string | null
          event: Database["public"]["Enums"]["notification_event"]
          id: string
          recipient_name: string | null
          recipient_phone: string | null
          sent_at: string | null
          template_bn: string
          template_en: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deleted_at?: string | null
          event: Database["public"]["Enums"]["notification_event"]
          id?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          template_bn?: string
          template_en?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deleted_at?: string | null
          event?: Database["public"]["Enums"]["notification_event"]
          id?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          template_bn?: string
          template_en?: string
        }
        Relationships: []
      }
      officer_metrics: {
        Row: {
          alert_frequency: number
          burnout_flagged_at: string | null
          burnout_risk: boolean
          calculated_at: string
          created_at: string
          failure_rate: number
          fulfilled_commitments: number
          id: string
          officer_id: string
          reschedule_rate: number
          risk_level: string
          risk_score: number
          total_commitments: number
          updated_at: string
          weekly_commitment_count: number
        }
        Insert: {
          alert_frequency?: number
          burnout_flagged_at?: string | null
          burnout_risk?: boolean
          calculated_at?: string
          created_at?: string
          failure_rate?: number
          fulfilled_commitments?: number
          id?: string
          officer_id: string
          reschedule_rate?: number
          risk_level?: string
          risk_score?: number
          total_commitments?: number
          updated_at?: string
          weekly_commitment_count?: number
        }
        Update: {
          alert_frequency?: number
          burnout_flagged_at?: string | null
          burnout_risk?: boolean
          calculated_at?: string
          created_at?: string
          failure_rate?: number
          fulfilled_commitments?: number
          id?: string
          officer_id?: string
          reschedule_rate?: number
          risk_level?: string
          risk_score?: number
          total_commitments?: number
          updated_at?: string
          weekly_commitment_count?: number
        }
        Relationships: []
      }
      officer_risk_profile: {
        Row: {
          adjustment_frequency: number
          created_at: string
          fine_override_rate: number
          id: string
          late_collection_pct: number
          late_collections: number
          officer_id: string
          period_month: string
          risk_level: string
          risk_score: number
          total_collections: number
          updated_at: string
        }
        Insert: {
          adjustment_frequency?: number
          created_at?: string
          fine_override_rate?: number
          id?: string
          late_collection_pct?: number
          late_collections?: number
          officer_id: string
          period_month: string
          risk_level?: string
          risk_score?: number
          total_collections?: number
          updated_at?: string
        }
        Update: {
          adjustment_frequency?: number
          created_at?: string
          fine_override_rate?: number
          id?: string
          late_collection_pct?: number
          late_collections?: number
          officer_id?: string
          period_month?: string
          risk_level?: string
          risk_score?: number
          total_collections?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_risk_profile_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_profit_distributions: {
        Row: {
          created_at: string
          distributed_at: string | null
          distributed_by: string | null
          distribution_status: string
          gross_revenue: number
          id: string
          investor_profit_paid: number
          net_profit: number
          notes: string | null
          operational_expenses: number
          period_month: string
          provision_for_loss: number
          total_deductions: number
          total_fee_income: number
          total_interest_collected: number
          total_penalty_collected: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_status?: string
          gross_revenue?: number
          id?: string
          investor_profit_paid?: number
          net_profit?: number
          notes?: string | null
          operational_expenses?: number
          period_month: string
          provision_for_loss?: number
          total_deductions?: number
          total_fee_income?: number
          total_interest_collected?: number
          total_penalty_collected?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_status?: string
          gross_revenue?: number
          id?: string
          investor_profit_paid?: number
          net_profit?: number
          notes?: string | null
          operational_expenses?: number
          period_month?: string
          provision_for_loss?: number
          total_deductions?: number
          total_fee_income?: number
          total_interest_collected?: number
          total_penalty_collected?: number
          updated_at?: string
        }
        Relationships: []
      }
      owner_profit_shares: {
        Row: {
          created_at: string
          distribution_id: string
          id: string
          owner_id: string
          paid_at: string | null
          payment_status: string
          share_amount: number
          share_percentage: number
        }
        Insert: {
          created_at?: string
          distribution_id: string
          id?: string
          owner_id: string
          paid_at?: string | null
          payment_status?: string
          share_amount?: number
          share_percentage?: number
        }
        Update: {
          created_at?: string
          distribution_id?: string
          id?: string
          owner_id?: string
          paid_at?: string | null
          payment_status?: string
          share_amount?: number
          share_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_profit_shares_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "owner_profit_distributions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          id: string
          loan_id: string | null
          metadata: Json | null
          notes: string | null
          reference_id: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          savings_id: string | null
          status: string
          submitted_by: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          id?: string
          loan_id?: string | null
          metadata?: Json | null
          notes?: string | null
          reference_id: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          savings_id?: string | null
          status?: string
          submitted_by: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          loan_id?: string | null
          metadata?: Json | null
          notes?: string | null
          reference_id?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          savings_id?: string | null
          status?: string
          submitted_by?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "pending_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_transactions_savings_id_fkey"
            columns: ["savings_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          id: string
          name_bn: string
          name_en: string
          owner_id: string | null
          phone: string | null
          pin_attempts: number
          pin_locked_until: string | null
          pin_updated_at: string | null
          role: string | null
          tenant_id: string
          transaction_pin_hash: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          id: string
          name_bn?: string
          name_en?: string
          owner_id?: string | null
          phone?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          pin_updated_at?: string | null
          role?: string | null
          tenant_id: string
          transaction_pin_hash?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          owner_id?: string | null
          phone?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          pin_updated_at?: string | null
          role?: string | null
          tenant_id?: string
          transaction_pin_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_events: {
        Row: {
          branch_id: string | null
          client_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          officer_id: string | null
          reason: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          risk_score: number
        }
        Insert: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          officer_id?: string | null
          reason?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          risk_score?: number
        }
        Update: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          officer_id?: string | null
          reason?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_accounts: {
        Row: {
          balance: number
          client_id: string
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          opened_date: string
          savings_product_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          opened_date?: string
          savings_product_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          opened_date?: string
          savings_product_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_accounts_savings_product_id_fkey"
            columns: ["savings_product_id"]
            isOneToOne: false
            referencedRelation: "savings_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_products: {
        Row: {
          advance_lock: boolean
          created_at: string
          deleted_at: string | null
          frequency: Database["public"]["Enums"]["deposit_frequency"]
          id: string
          lock_period_days: number
          max_amount: number
          min_amount: number
          minimum_balance: number
          partial_payment_allowed: boolean
          product_name_bn: string
          product_name_en: string
          product_type: Database["public"]["Enums"]["savings_product_type"]
          profit_rate: number
          updated_at: string
        }
        Insert: {
          advance_lock?: boolean
          created_at?: string
          deleted_at?: string | null
          frequency?: Database["public"]["Enums"]["deposit_frequency"]
          id?: string
          lock_period_days?: number
          max_amount?: number
          min_amount?: number
          minimum_balance?: number
          partial_payment_allowed?: boolean
          product_name_bn?: string
          product_name_en: string
          product_type?: Database["public"]["Enums"]["savings_product_type"]
          profit_rate?: number
          updated_at?: string
        }
        Update: {
          advance_lock?: boolean
          created_at?: string
          deleted_at?: string | null
          frequency?: Database["public"]["Enums"]["deposit_frequency"]
          id?: string
          lock_period_days?: number
          max_amount?: number
          min_amount?: number
          minimum_balance?: number
          partial_payment_allowed?: boolean
          product_name_bn?: string
          product_name_en?: string
          product_type?: Database["public"]["Enums"]["savings_product_type"]
          profit_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_text: string
          message_type: string
          recipient_name: string | null
          recipient_phone: string
          sent_at: string | null
          sent_by: string | null
          status: string
          tenant_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_text: string
          message_type?: string
          recipient_name?: string | null
          recipient_phone: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_text?: string
          message_type?: string
          recipient_name?: string | null
          recipient_phone?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          end_date: string
          id: string
          locked_at: string | null
          locked_reason: string | null
          max_customers: number
          max_loans: number
          plan: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          locked_at?: string | null
          locked_reason?: string | null
          max_customers?: number
          max_loans?: number
          plan?: string
          start_date?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          locked_at?: string | null
          locked_reason?: string | null
          max_customers?: number
          max_loans?: number
          plan?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          is_resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_config: {
        Row: {
          accent_color: string
          created_at: string
          display_name: string
          display_name_bn: string
          footer_text: string | null
          header_bg_url: string | null
          id: string
          logo_url: string | null
          primary_color: string
          secondary_color: string
          sms_sender_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          display_name?: string
          display_name_bn?: string
          footer_text?: string | null
          header_bg_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          sms_sender_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          display_name?: string
          display_name_bn?: string
          footer_text?: string | null
          header_bg_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          sms_sender_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          rule_key: string
          rule_value: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          rule_key: string
          rule_value?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          rule_key?: string
          rule_value?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          id: number
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          setting_key: string
          setting_value?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          status?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          investor_id: string | null
          loan_id: string | null
          notes: string | null
          partial_flag: boolean
          performed_by: string | null
          reference_id: string | null
          savings_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          investor_id?: string | null
          loan_id?: string | null
          notes?: string | null
          partial_flag?: boolean
          performed_by?: string | null
          reference_id?: string | null
          savings_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          investor_id?: string | null
          loan_id?: string | null
          notes?: string | null
          partial_flag?: boolean
          performed_by?: string | null
          reference_id?: string | null
          savings_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_financial_summary"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_savings_id_fkey"
            columns: ["savings_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          is_active: boolean
          last_login: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_login?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_login?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      loan_financial_summary: {
        Row: {
          client_id: string | null
          disbursement_date: string | null
          loan_id: string | null
          loan_model: Database["public"]["Enums"]["loan_model"] | null
          maturity_date: string | null
          remaining_balance: number | null
          status: Database["public"]["Enums"]["loan_status"] | null
          total_interest: number | null
          total_interest_collected: number | null
          total_penalty_collected: number | null
          total_principal: number | null
          total_principal_collected: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      view_ai_chip_usage: {
        Row: {
          chip_date: string | null
          chip_label: string | null
          unique_users: number | null
          usage_count: number | null
        }
        Relationships: []
      }
      view_officer_performance_summary: {
        Row: {
          avg_reason_length: number | null
          fulfillment_rate_pct: number | null
          officer_id: string | null
          officer_name_bn: string | null
          officer_name_en: string | null
          total_actions: number | null
          total_failures: number | null
          total_fulfilled: number | null
          total_rescheduled: number | null
        }
        Relationships: []
      }
      view_reschedule_prediction_input: {
        Row: {
          client_id: string | null
          client_reschedule_count: number | null
          client_unfulfilled_count: number | null
          commitment_date: string | null
          commitment_id: string | null
          officer_id: string | null
          officer_reschedule_pct: number | null
          probability_score: number | null
          weekday_reschedule_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commitments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      view_reschedule_rate: {
        Row: {
          fulfill_count: number | null
          report_date: string | null
          reschedule_count: number | null
          reschedule_rate_pct: number | null
        }
        Relationships: []
      }
      view_swipe_success_rate: {
        Row: {
          report_date: string | null
          success_rate_pct: number | null
          total_actions: number | null
          total_failed: number | null
          total_success: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_loan_payment: {
        Args: {
          _amount: number
          _loan_id: string
          _performed_by?: string
          _reference_id?: string
        }
        Returns: Json
      }
      approve_financial_transaction: {
        Args: { _approver_id: string; _reason?: string; _tx_id: string }
        Returns: Json
      }
      approve_pending_transaction: {
        Args: { _reason?: string; _reviewer_id: string; _tx_id: string }
        Returns: Json
      }
      auto_default_loans: { Args: never; Returns: Json }
      calculate_credit_score: { Args: { _client_id: string }; Returns: Json }
      calculate_installment: {
        Args: { _interest_rate: number; _principal: number; _tenure: number }
        Returns: number
      }
      calculate_monthly_officer_risk: {
        Args: { p_month?: string }
        Returns: Json
      }
      calculate_officer_risk_score: {
        Args: { _officer_id?: string }
        Returns: Json
      }
      calculate_owner_profit: {
        Args: { _created_by?: string; _period_month: string }
        Returns: Json
      }
      can_export: { Args: never; Returns: boolean }
      check_and_apply_overdue_penalty: {
        Args: { _penalty_percent?: number }
        Returns: Json
      }
      check_commitment_alert_thresholds: { Args: never; Returns: Json }
      create_client_secure: { Args: { p_data: Json }; Returns: string }
      create_investor_secure: {
        Args: {
          p_address?: string
          p_capital?: number
          p_investment_model?: Database["public"]["Enums"]["investment_model"]
          p_monthly_profit_percent?: number
          p_name_bn?: string
          p_name_en: string
          p_nid_number?: string
          p_nominee_name?: string
          p_nominee_nid?: string
          p_nominee_phone?: string
          p_nominee_relation?: string
          p_phone?: string
          p_principal_amount?: number
          p_reinvest?: boolean
          p_source_of_fund?: string
          p_tenure_years?: number
          p_weekly_paid_until?: string
          p_weekly_share?: number
        }
        Returns: string
      }
      create_investor_weekly_transaction: {
        Args: { p_data: Json }
        Returns: string
      }
      create_ledger_entry: {
        Args: {
          _branch_id: string
          _created_by?: string
          _entries: Json
          _reference_id: string
          _reference_type: string
        }
        Returns: Json
      }
      create_or_update_transaction_pin: {
        Args: { _new_pin: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      detect_high_risk_clients: { Args: never; Returns: Json }
      detect_officer_burnout: {
        Args: { _failure_threshold?: number; _weekly_threshold?: number }
        Returns: Json
      }
      disburse_loan: {
        Args: {
          _assigned_officer?: string
          _client_id: string
          _disbursement_date?: string
          _loan_model?: string
          _loan_product_id: string
          _notes?: string
          _principal_amount: number
        }
        Returns: Json
      }
      exit_investor_secure: { Args: { p_id: string }; Returns: undefined }
      generate_loan_schedule: {
        Args: {
          _client_id: string
          _disbursement_date: string
          _interest_rate: number
          _loan_id: string
          _loan_model: string
          _payment_type: string
          _principal: number
          _tenure: number
        }
        Returns: undefined
      }
      generate_preventive_recommendations: { Args: never; Returns: Json }
      generate_receipt_number: { Args: never; Returns: string }
      generate_weekly_intelligence_summary: { Args: never; Returns: Json }
      get_anomaly_alerts: { Args: { p_limit?: number }; Returns: Json }
      get_branch_risk_summary: { Args: never; Returns: Json }
      get_dashboard_summary_metrics: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_server_time: { Args: never; Returns: Json }
      get_subscription_status: {
        Args: never
        Returns: {
          days_remaining: number
          end_date: string
          max_customers: number
          max_loans: number
          plan: string
          status: string
        }[]
      }
      get_super_admin_dashboard: { Args: never; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_owner: { Args: never; Returns: boolean }
      is_assigned_to_client: { Args: { _client_id: string }; Returns: boolean }
      is_feature_enabled: {
        Args: { _feature_name: string; _user_role?: string }
        Returns: boolean
      }
      is_field_officer: { Args: never; Returns: boolean }
      is_investor: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_penalty_suspended: { Args: { _client_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_treasurer: { Args: never; Returns: boolean }
      lock_expired_subscriptions: { Args: never; Returns: undefined }
      mark_schedule_payment: {
        Args: { _amount: number; _loan_id: string; _paid_date?: string }
        Returns: undefined
      }
      populate_daily_summary: { Args: { _target_date?: string }; Returns: Json }
      post_advance_buffer_entries: { Args: never; Returns: Json }
      predict_loan_risk: { Args: never; Returns: Json }
      process_ghost_penalties: { Args: never; Returns: Json }
      process_investor_reinvest: {
        Args: { _investor_id: string }
        Returns: undefined
      }
      process_weekly_batch: { Args: { p_payload: Json }; Returns: Json }
      reconcile_savings_balances: { Args: never; Returns: Json }
      reject_financial_transaction: {
        Args: { _reason: string; _rejector_id: string; _tx_id: string }
        Returns: undefined
      }
      reject_pending_transaction: {
        Args: { _reason: string; _reviewer_id: string; _tx_id: string }
        Returns: undefined
      }
      reset_sms_quota: { Args: { p_tenant_id: string }; Returns: undefined }
      resolve_anomaly_alert: { Args: { p_event_id: string }; Returns: boolean }
      reverse_ledger_transaction: {
        Args: {
          _reason: string
          _reversed_by?: string
          _transaction_group_id: string
        }
        Returns: Json
      }
      send_sms: {
        Args: {
          p_message: string
          p_message_type?: string
          p_recipient: string
          p_recipient_name?: string
        }
        Returns: string
      }
      snooze_installment: {
        Args: { p_promised_date: string; p_schedule_id: string }
        Returns: Json
      }
      suspend_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      sync_overdue_schedules: { Args: never; Returns: Json }
      unlock_subscription: { Args: { p_tenant_id: string }; Returns: undefined }
      unsuspend_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      update_client_secure: {
        Args: { p_data: Json; p_id: string }
        Returns: undefined
      }
      update_investor_risk_flags: { Args: never; Returns: Json }
      update_investor_secure: {
        Args: {
          p_address?: string
          p_capital?: number
          p_id: string
          p_investment_model?: Database["public"]["Enums"]["investment_model"]
          p_monthly_profit_percent?: number
          p_name_bn?: string
          p_name_en?: string
          p_nid_number?: string
          p_nominee_name?: string
          p_nominee_nid?: string
          p_nominee_phone?: string
          p_nominee_relation?: string
          p_phone?: string
          p_principal_amount?: number
          p_reinvest?: boolean
          p_source_of_fund?: string
          p_tenure_years?: number
          p_weekly_share?: number
        }
        Returns: undefined
      }
      update_investor_status: { Args: never; Returns: Json }
      upsert_subscription: {
        Args: {
          p_end_date: string
          p_max_customers?: number
          p_max_loans?: number
          p_plan: string
          p_start_date: string
        }
        Returns: undefined
      }
      upsert_system_setting: {
        Args: { p_setting_key: string; p_setting_value: Json }
        Returns: undefined
      }
      upsert_tenant_config: {
        Args: {
          p_accent_color?: string
          p_display_name?: string
          p_display_name_bn?: string
          p_footer_text?: string
          p_header_bg_url?: string
          p_logo_url?: string
          p_primary_color?: string
          p_secondary_color?: string
          p_sms_sender_name?: string
        }
        Returns: undefined
      }
      upsert_tenant_rule: {
        Args: { p_description?: string; p_rule_key: string; p_rule_value: Json }
        Returns: undefined
      }
      upsert_tenant_setting: {
        Args: { p_setting_key: string; p_setting_value: Json }
        Returns: undefined
      }
      validate_ledger_balance: { Args: { _tx_id: string }; Returns: boolean }
      validate_ledger_v2_balance: {
        Args: { _txn_group_id: string }
        Returns: boolean
      }
      verify_all_branches_integrity: { Args: never; Returns: Json }
      verify_event_chain_integrity: { Args: never; Returns: Json }
      verify_ledger_integrity: { Args: { p_branch_id: string }; Returns: Json }
      verify_transaction_pin: { Args: { _input_pin: string }; Returns: Json }
    }
    Enums: {
      account_code:
        | "CASH_ON_HAND"
        | "LOAN_PRINCIPAL"
        | "LOAN_INTEREST"
        | "PENALTY_INCOME"
        | "SAVINGS_LIABILITY"
        | "SHARE_CAPITAL"
        | "INSURANCE_PAYABLE"
        | "ADMISSION_FEE_INCOME"
        | "INSURANCE_PREMIUM_INCOME"
        | "ADJUSTMENT_ACCOUNT"
        | "DISBURSEMENT_OUTFLOW"
      account_type: "asset" | "liability" | "income" | "expense" | "equity"
      app_role: "admin" | "field_officer" | "owner" | "investor" | "treasurer"
      approval_status: "pending" | "approved" | "rejected"
      client_status: "active" | "pending" | "overdue" | "inactive"
      commitment_status: "pending" | "fulfilled" | "rescheduled"
      deposit_frequency: "daily" | "weekly" | "monthly"
      entry_type: "debit" | "credit"
      fin_transaction_type:
        | "loan_repayment"
        | "loan_disbursement"
        | "savings_deposit"
        | "savings_withdrawal"
        | "admission_fee"
        | "share_capital_deposit"
        | "insurance_premium"
        | "insurance_claim_payout"
        | "adjustment_entry"
      investment_model: "profit_only" | "profit_plus_principal"
      investor_status: "active" | "matured" | "closed"
      loan_model: "flat" | "reducing"
      loan_status: "active" | "closed" | "default"
      notification_channel: "sms" | "whatsapp"
      notification_event:
        | "loan_due"
        | "savings_due"
        | "profit_distributed"
        | "overdue_alert"
        | "deposit_reminder"
      payment_type: "monthly" | "weekly" | "emi" | "bullet" | "monthly_profit"
      savings_product_type: "general" | "locked"
      transaction_status: "paid" | "pending" | "overdue"
      transaction_type:
        | "loan_disbursement"
        | "loan_repayment"
        | "savings_deposit"
        | "savings_withdrawal"
        | "investor_profit"
        | "loan_principal"
        | "loan_interest"
        | "loan_penalty"
        | "investor_principal_return"
        | "owner_profit_share"
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
  public: {
    Enums: {
      account_code: [
        "CASH_ON_HAND",
        "LOAN_PRINCIPAL",
        "LOAN_INTEREST",
        "PENALTY_INCOME",
        "SAVINGS_LIABILITY",
        "SHARE_CAPITAL",
        "INSURANCE_PAYABLE",
        "ADMISSION_FEE_INCOME",
        "INSURANCE_PREMIUM_INCOME",
        "ADJUSTMENT_ACCOUNT",
        "DISBURSEMENT_OUTFLOW",
      ],
      account_type: ["asset", "liability", "income", "expense", "equity"],
      app_role: ["admin", "field_officer", "owner", "investor", "treasurer"],
      approval_status: ["pending", "approved", "rejected"],
      client_status: ["active", "pending", "overdue", "inactive"],
      commitment_status: ["pending", "fulfilled", "rescheduled"],
      deposit_frequency: ["daily", "weekly", "monthly"],
      entry_type: ["debit", "credit"],
      fin_transaction_type: [
        "loan_repayment",
        "loan_disbursement",
        "savings_deposit",
        "savings_withdrawal",
        "admission_fee",
        "share_capital_deposit",
        "insurance_premium",
        "insurance_claim_payout",
        "adjustment_entry",
      ],
      investment_model: ["profit_only", "profit_plus_principal"],
      investor_status: ["active", "matured", "closed"],
      loan_model: ["flat", "reducing"],
      loan_status: ["active", "closed", "default"],
      notification_channel: ["sms", "whatsapp"],
      notification_event: [
        "loan_due",
        "savings_due",
        "profit_distributed",
        "overdue_alert",
        "deposit_reminder",
      ],
      payment_type: ["monthly", "weekly", "emi", "bullet", "monthly_profit"],
      savings_product_type: ["general", "locked"],
      transaction_status: ["paid", "pending", "overdue"],
      transaction_type: [
        "loan_disbursement",
        "loan_repayment",
        "savings_deposit",
        "savings_withdrawal",
        "investor_profit",
        "loan_principal",
        "loan_interest",
        "loan_penalty",
        "investor_principal_return",
        "owner_profit_share",
      ],
    },
  },
} as const
