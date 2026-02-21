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
      audit_logs: {
        Row: {
          action_type: string
          branch_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
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
        ]
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
      investors: {
        Row: {
          accumulated_profit: number
          capital: number
          created_at: string
          deleted_at: string | null
          id: string
          investment_model: Database["public"]["Enums"]["investment_model"]
          investor_id: string | null
          last_profit_date: string | null
          maturity_date: string | null
          monthly_profit_percent: number
          name_bn: string
          name_en: string
          phone: string | null
          principal_amount: number
          reinvest: boolean
          serial_number: number | null
          status: Database["public"]["Enums"]["investor_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accumulated_profit?: number
          capital?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          investment_model?: Database["public"]["Enums"]["investment_model"]
          investor_id?: string | null
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en: string
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
          serial_number?: number | null
          status?: Database["public"]["Enums"]["investor_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accumulated_profit?: number
          capital?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          investment_model?: Database["public"]["Enums"]["investment_model"]
          investor_id?: string | null
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en?: string
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
          serial_number?: number | null
          status?: Database["public"]["Enums"]["investor_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          account_type: Database["public"]["Enums"]["account_type"]
          amount: number
          branch_id: string
          created_at: string
          created_by: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id: string
          is_reversal: boolean
          narration: string | null
          original_group_id: string | null
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
          entry_type: Database["public"]["Enums"]["entry_type"]
          id?: string
          is_reversal?: boolean
          narration?: string | null
          original_group_id?: string | null
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
          entry_type?: Database["public"]["Enums"]["entry_type"]
          id?: string
          is_reversal?: boolean
          narration?: string | null
          original_group_id?: string | null
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
          loan_id: string
          notes: string | null
          paid_date: string | null
          penalty_due: number
          principal_due: number
          principal_paid: number
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
          loan_id: string
          notes?: string | null
          paid_date?: string | null
          penalty_due?: number
          principal_due?: number
          principal_paid?: number
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
          loan_id?: string
          notes?: string | null
          paid_date?: string | null
          penalty_due?: number
          principal_due?: number
          principal_paid?: number
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
          created_at: string
          id: string
          name_bn: string
          name_en: string
          owner_id: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          name_bn?: string
          name_en?: string
          owner_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          owner_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
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
          status: string
          transaction_id: string | null
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
          status?: string
          transaction_id?: string | null
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
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
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
      calculate_installment: {
        Args: { _interest_rate: number; _principal: number; _tenure: number }
        Returns: number
      }
      calculate_owner_profit: {
        Args: { _created_by?: string; _period_month: string }
        Returns: Json
      }
      check_and_apply_overdue_penalty: {
        Args: { _penalty_percent?: number }
        Returns: Json
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
      generate_receipt_number: { Args: never; Returns: string }
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
      is_field_officer: { Args: never; Returns: boolean }
      is_investor: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_treasurer: { Args: never; Returns: boolean }
      mark_schedule_payment: {
        Args: { _amount: number; _loan_id: string; _paid_date?: string }
        Returns: undefined
      }
      predict_loan_risk: { Args: never; Returns: Json }
      process_investor_reinvest: {
        Args: { _investor_id: string }
        Returns: undefined
      }
      reconcile_savings_balances: { Args: never; Returns: Json }
      reject_financial_transaction: {
        Args: { _reason: string; _rejector_id: string; _tx_id: string }
        Returns: undefined
      }
      reject_pending_transaction: {
        Args: { _reason: string; _reviewer_id: string; _tx_id: string }
        Returns: undefined
      }
      reverse_ledger_transaction: {
        Args: {
          _reason: string
          _reversed_by?: string
          _transaction_group_id: string
        }
        Returns: Json
      }
      sync_overdue_schedules: { Args: never; Returns: Json }
      validate_ledger_balance: { Args: { _tx_id: string }; Returns: boolean }
      validate_ledger_v2_balance: {
        Args: { _txn_group_id: string }
        Returns: boolean
      }
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
