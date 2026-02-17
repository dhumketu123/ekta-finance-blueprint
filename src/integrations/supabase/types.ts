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
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          area: string | null
          assigned_officer: string | null
          created_at: string
          deleted_at: string | null
          id: string
          loan_amount: number | null
          loan_product_id: string | null
          name_bn: string
          name_en: string
          next_payment_date: string | null
          phone: string | null
          savings_product_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          area?: string | null
          assigned_officer?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          loan_amount?: number | null
          loan_product_id?: string | null
          name_bn?: string
          name_en: string
          next_payment_date?: string | null
          phone?: string | null
          savings_product_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          area?: string | null
          assigned_officer?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          loan_amount?: number | null
          loan_product_id?: string | null
          name_bn?: string
          name_en?: string
          next_payment_date?: string | null
          phone?: string | null
          savings_product_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
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
      investors: {
        Row: {
          accumulated_profit: number
          capital: number
          created_at: string
          deleted_at: string | null
          id: string
          investment_model: Database["public"]["Enums"]["investment_model"]
          last_profit_date: string | null
          maturity_date: string | null
          monthly_profit_percent: number
          name_bn: string
          name_en: string
          phone: string | null
          principal_amount: number
          reinvest: boolean
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
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en: string
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
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
          last_profit_date?: string | null
          maturity_date?: string | null
          monthly_profit_percent?: number
          name_bn?: string
          name_en?: string
          phone?: string | null
          principal_amount?: number
          reinvest?: boolean
          status?: Database["public"]["Enums"]["investor_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      loans: {
        Row: {
          assigned_officer: string | null
          client_id: string
          created_at: string
          deleted_at: string | null
          disbursement_date: string | null
          emi_amount: number
          id: string
          loan_model: Database["public"]["Enums"]["loan_model"]
          loan_product_id: string | null
          maturity_date: string | null
          notes: string | null
          outstanding_interest: number
          outstanding_principal: number
          penalty_amount: number
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
          loan_model?: Database["public"]["Enums"]["loan_model"]
          loan_product_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          outstanding_interest?: number
          outstanding_principal?: number
          penalty_amount?: number
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
          loan_model?: Database["public"]["Enums"]["loan_model"]
          loan_product_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          outstanding_interest?: number
          outstanding_principal?: number
          penalty_amount?: number
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
      profiles: {
        Row: {
          created_at: string
          id: string
          name_bn: string
          name_en: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name_bn?: string
          name_en?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          phone?: string | null
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
      apply_loan_payment:
        | {
            Args: { _amount: number; _loan_id: string; _performed_by?: string }
            Returns: Json
          }
        | {
            Args: {
              _amount: number
              _loan_id: string
              _performed_by?: string
              _reference_id?: string
            }
            Returns: Json
          }
      calculate_installment: {
        Args: { _interest_rate: number; _principal: number; _tenure: number }
        Returns: number
      }
      check_and_apply_overdue_penalty: {
        Args: { _penalty_percent?: number }
        Returns: Json
      }
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
      process_investor_reinvest: {
        Args: { _investor_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "field_officer" | "owner" | "investor"
      client_status: "active" | "pending" | "overdue" | "inactive"
      deposit_frequency: "daily" | "weekly" | "monthly"
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
      app_role: ["admin", "field_officer", "owner", "investor"],
      client_status: ["active", "pending", "overdue", "inactive"],
      deposit_frequency: ["daily", "weekly", "monthly"],
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
