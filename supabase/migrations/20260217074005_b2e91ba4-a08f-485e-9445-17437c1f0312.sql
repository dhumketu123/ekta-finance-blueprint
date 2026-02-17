
-- ============================================
-- Step 1: Enums
-- ============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'field_officer', 'owner', 'investor');
CREATE TYPE public.client_status AS ENUM ('active', 'pending', 'overdue', 'inactive');
CREATE TYPE public.payment_type AS ENUM ('monthly', 'weekly', 'emi', 'bullet', 'monthly_profit');
CREATE TYPE public.deposit_frequency AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.transaction_type AS ENUM ('loan_disbursement', 'loan_repayment', 'savings_deposit', 'savings_withdrawal', 'investor_profit');
CREATE TYPE public.transaction_status AS ENUM ('paid', 'pending', 'overdue');
CREATE TYPE public.notification_event AS ENUM ('loan_due', 'savings_due', 'profit_distributed', 'overdue_alert', 'deposit_reminder');
CREATE TYPE public.notification_channel AS ENUM ('sms', 'whatsapp');

-- ============================================
-- Step 2: Profiles table
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL DEFAULT '',
  name_bn TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 3: User Roles table (CRITICAL: separate from profiles)
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 4: Helper functions (security definer)
-- ============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
$$;

CREATE OR REPLACE FUNCTION public.is_field_officer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'field_officer')
$$;

CREATE OR REPLACE FUNCTION public.is_investor()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'investor')
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_owner()
$$;

-- ============================================
-- Step 5: Loan Products table
-- ============================================
CREATE TABLE public.loan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name_en TEXT NOT NULL,
  product_name_bn TEXT NOT NULL DEFAULT '',
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tenure_months INTEGER NOT NULL DEFAULT 12,
  payment_type payment_type NOT NULL DEFAULT 'monthly',
  min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 6: Savings Products table
-- ============================================
CREATE TABLE public.savings_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name_en TEXT NOT NULL,
  product_name_bn TEXT NOT NULL DEFAULT '',
  frequency deposit_frequency NOT NULL DEFAULT 'monthly',
  min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_lock BOOLEAN NOT NULL DEFAULT false,
  partial_payment_allowed BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.savings_products ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 7: Clients table
-- ============================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL DEFAULT '',
  phone TEXT,
  area TEXT,
  assigned_officer UUID REFERENCES auth.users(id),
  loan_product_id UUID REFERENCES public.loan_products(id),
  savings_product_id UUID REFERENCES public.savings_products(id),
  loan_amount NUMERIC(12,2) DEFAULT 0,
  status client_status NOT NULL DEFAULT 'active',
  next_payment_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_clients_assigned_officer ON public.clients(assigned_officer);
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_deleted_at ON public.clients(deleted_at);

-- ============================================
-- Step 8: Investors table
-- ============================================
CREATE TABLE public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL DEFAULT '',
  phone TEXT,
  capital NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_profit_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  reinvest BOOLEAN NOT NULL DEFAULT false,
  last_profit_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_investors_user_id ON public.investors(user_id);
CREATE INDEX idx_investors_deleted_at ON public.investors(deleted_at);

-- ============================================
-- Step 9: Transactions table
-- ============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id),
  investor_id UUID REFERENCES public.investors(id),
  type transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status transaction_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transactions_client_id ON public.transactions(client_id);
CREATE INDEX idx_transactions_investor_id ON public.transactions(investor_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_date ON public.transactions(transaction_date);

-- ============================================
-- Step 10: Notifications table
-- ============================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event notification_event NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'sms',
  template_en TEXT NOT NULL DEFAULT '',
  template_bn TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT,
  recipient_name TEXT,
  sent_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 11: Audit Logs table
-- ============================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- ============================================
-- Step 12: Helper function for assigned client check
-- ============================================
CREATE OR REPLACE FUNCTION public.is_assigned_to_client(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id
      AND assigned_officer = auth.uid()
      AND deleted_at IS NULL
  )
$$;

-- ============================================
-- Step 13: RLS Policies
-- ============================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Admins/owners can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_owner());

-- User Roles (read only for authenticated, manage by admin/owner)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins/owners can manage roles" ON public.user_roles FOR ALL USING (public.is_admin_or_owner());

-- Loan Products
CREATE POLICY "Admin/owner full access loan_products" ON public.loan_products FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Authenticated can view loan_products" ON public.loan_products FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- Savings Products
CREATE POLICY "Admin/owner full access savings_products" ON public.savings_products FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Authenticated can view savings_products" ON public.savings_products FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- Clients
CREATE POLICY "Admin/owner full access clients" ON public.clients FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Field officers view assigned clients" ON public.clients FOR SELECT USING (
  public.is_field_officer() AND assigned_officer = auth.uid() AND deleted_at IS NULL
);

-- Investors
CREATE POLICY "Admin/owner full access investors" ON public.investors FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Investors view own record" ON public.investors FOR SELECT USING (
  public.is_investor() AND user_id = auth.uid() AND deleted_at IS NULL
);

-- Transactions
CREATE POLICY "Admin/owner full access transactions" ON public.transactions FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Field officers view client transactions" ON public.transactions FOR SELECT USING (
  public.is_field_officer() AND public.is_assigned_to_client(client_id) AND deleted_at IS NULL
);
CREATE POLICY "Investors view own transactions" ON public.transactions FOR SELECT USING (
  public.is_investor() AND investor_id IN (
    SELECT id FROM public.investors WHERE user_id = auth.uid()
  ) AND deleted_at IS NULL
);

-- Notifications
CREATE POLICY "Admin/owner full access notifications" ON public.notifications FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Authenticated can view notifications" ON public.notifications FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- Audit Logs
CREATE POLICY "Admin/owner full access audit_logs" ON public.audit_logs FOR ALL USING (public.is_admin_or_owner());
CREATE POLICY "Authenticated can view audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);

-- ============================================
-- Step 14: Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_loan_products_updated_at BEFORE UPDATE ON public.loan_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_savings_products_updated_at BEFORE UPDATE ON public.savings_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_investors_updated_at BEFORE UPDATE ON public.investors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Step 15: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Step 16: Enable realtime for key tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.investors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
