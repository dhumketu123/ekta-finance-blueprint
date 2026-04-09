
-- ═══════════════════════════════════════════════════════
-- PHASE 1: BUSINESS RULE WIRING (10 nodes)
-- ═══════════════════════════════════════════════════════

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:profiles","relation_type":"enforced_by","weight":10},
  {"target_key":"table:loans","relation_type":"applies_to","weight":10},
  {"target_key":"table:clients","relation_type":"applies_to","weight":10},
  {"target_key":"table:investors","relation_type":"applies_to","weight":10},
  {"target_key":"function:get_user_tenant_id","relation_type":"enforced_by","weight":10}
]'::jsonb WHERE node_key = 'rule:tenant_isolation' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"applies_to","weight":10},
  {"target_key":"table:loans","relation_type":"applies_to","weight":10},
  {"target_key":"table:financial_transactions","relation_type":"applies_to","weight":10},
  {"target_key":"function:is_admin_or_owner","relation_type":"enforced_by","weight":10},
  {"target_key":"function:get_user_role","relation_type":"enforced_by","weight":10}
]'::jsonb WHERE node_key = 'rule:rls_enforcement' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"applies_to","weight":10},
  {"target_key":"table:investors","relation_type":"applies_to","weight":10},
  {"target_key":"table:profiles","relation_type":"enforced_by","weight":10}
]'::jsonb WHERE node_key = 'rule:cross_role_phone_guard' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:double_entry_ledger","relation_type":"applies_to","weight":10},
  {"target_key":"table:financial_transactions","relation_type":"applies_to","weight":10}
]'::jsonb WHERE node_key = 'rule:append_only_ledger' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"applies_to","weight":10},
  {"target_key":"table:investors","relation_type":"applies_to","weight":10}
]'::jsonb WHERE node_key = 'rule:canonical_phone_format' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:financial_transactions","relation_type":"applies_to","weight":9},
  {"target_key":"function:prevent_approved_edit","relation_type":"enforced_by","weight":9}
]'::jsonb WHERE node_key = 'rule:maker_checker' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"applies_to","weight":9},
  {"target_key":"table:investor_weekly_transactions","relation_type":"derived_from","weight":9}
]'::jsonb WHERE node_key = 'rule:investor_profit_dist' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:daily_user_close","relation_type":"applies_to","weight":9},
  {"target_key":"table:financial_transactions","relation_type":"derived_from","weight":9}
]'::jsonb WHERE node_key = 'rule:day_close_reconciliation' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"applies_to","weight":8},
  {"target_key":"table:loan_schedules","relation_type":"derived_from","weight":8}
]'::jsonb WHERE node_key = 'rule:overdue_penalty_calc' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"applies_to","weight":7},
  {"target_key":"table:loans","relation_type":"derived_from","weight":7}
]'::jsonb WHERE node_key = 'rule:trust_scoring' AND relationships = '[]'::jsonb;

-- ═══════════════════════════════════════════════════════
-- PHASE 2: KPI WIRING (8 nodes)
-- ═══════════════════════════════════════════════════════

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"derived_from","weight":10}
]'::jsonb WHERE node_key = 'kpi:npl_ratio' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"derived_from","weight":10}
]'::jsonb WHERE node_key = 'kpi:total_loan_portfolio' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"derived_from","weight":9},
  {"target_key":"table:investor_weekly_transactions","relation_type":"derived_from","weight":9}
]'::jsonb WHERE node_key = 'kpi:investor_roi' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:financial_transactions","relation_type":"derived_from","weight":9},
  {"target_key":"table:daily_financial_summary","relation_type":"derived_from","weight":8}
]'::jsonb WHERE node_key = 'kpi:collection_rate' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"derived_from","weight":9},
  {"target_key":"table:loan_schedules","relation_type":"derived_from","weight":9}
]'::jsonb WHERE node_key = 'kpi:overdue_count' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:savings_accounts","relation_type":"derived_from","weight":8}
]'::jsonb WHERE node_key = 'kpi:savings_growth' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:daily_user_close","relation_type":"derived_from","weight":8}
]'::jsonb WHERE node_key = 'kpi:day_close_variance' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"derived_from","weight":8}
]'::jsonb WHERE node_key = 'kpi:onboarding_success' AND relationships = '[]'::jsonb;

-- ═══════════════════════════════════════════════════════
-- PHASE 3: EDGE FUNCTION WIRING (12 nodes)
-- ═══════════════════════════════════════════════════════

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":9},
  {"target_key":"table:commitments","relation_type":"reads","weight":9},
  {"target_key":"table:loan_schedules","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'edge:daily-cron' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"reads","weight":9},
  {"target_key":"table:investor_weekly_transactions","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'edge:monthly-investor-profit' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:double_entry_ledger","relation_type":"reads","weight":9},
  {"target_key":"table:financial_transactions","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'edge:ledger-audit' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"writes","weight":8}
]'::jsonb WHERE node_key = 'edge:knowledge-sync' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:commitments","relation_type":"writes","weight":8},
  {"target_key":"table:clients","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'edge:commitments-create' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":8},
  {"target_key":"table:clients","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'edge:system-health' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":8},
  {"target_key":"table:clients","relation_type":"reads","weight":8},
  {"target_key":"table:financial_transactions","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'edge:weekly-intelligence' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:in_app_notifications","relation_type":"writes","weight":7}
]'::jsonb WHERE node_key = 'edge:send-notification' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:commitments","relation_type":"reads","weight":7}
]'::jsonb WHERE node_key = 'edge:commitments-reschedule-swipe' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:commitments","relation_type":"reads","weight":7}
]'::jsonb WHERE node_key = 'edge:monthly-commitment-export' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:commitments","relation_type":"reads","weight":7}
]'::jsonb WHERE node_key = 'edge:commitments-reschedule' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[]'::jsonb
WHERE node_key = 'edge:server-time' AND relationships = '[]'::jsonb;

-- ═══════════════════════════════════════════════════════
-- PHASE 4: COMPONENT WIRING (9 nodes)
-- ═══════════════════════════════════════════════════════

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"hook:usePermissions","relation_type":"depends_on","weight":10},
  {"target_key":"component:AuthContext","relation_type":"depends_on","weight":10}
]'::jsonb WHERE node_key = 'component:ProtectedRoute' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:profiles","relation_type":"queries","weight":10},
  {"target_key":"table:user_roles","relation_type":"queries","weight":10}
]'::jsonb WHERE node_key = 'component:AuthContext' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"component:AppSidebar","relation_type":"contains","weight":9},
  {"target_key":"component:BottomNav","relation_type":"contains","weight":8}
]'::jsonb WHERE node_key = 'component:AppLayout' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"queries","weight":9},
  {"target_key":"table:financial_transactions","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'component:LoanPaymentModal' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'component:InvestorForm' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:tenant_settings","relation_type":"queries","weight":9}
]'::jsonb WHERE node_key = 'component:TenantBrandingContext' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:savings_accounts","relation_type":"queries","weight":9},
  {"target_key":"table:financial_transactions","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'component:SavingsTransactionModal' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"hook:usePermissions","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'component:AppSidebar' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'component:ClientForm' AND relationships = '[]'::jsonb;

-- ═══════════════════════════════════════════════════════
-- PHASE 5: CORE TABLE + FUNCTION WIRING
-- ═══════════════════════════════════════════════════════

-- table:user_roles (criticality 10, currently orphan)
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:profiles","relation_type":"references","weight":10},
  {"target_key":"function:get_user_role","relation_type":"queried_by","weight":10},
  {"target_key":"function:is_admin_or_owner","relation_type":"queried_by","weight":10}
]'::jsonb WHERE node_key = 'table:user_roles' AND relationships = '[]'::jsonb;

-- Critical functions that are orphans
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":10}
]'::jsonb WHERE node_key = 'function:get_user_role' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":10}
]'::jsonb WHERE node_key = 'function:is_admin_or_owner' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":10}
]'::jsonb WHERE node_key = 'function:is_admin' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:is_super_admin' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:is_treasurer' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:is_investor' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:profiles","relation_type":"depends_on","weight":10}
]'::jsonb WHERE node_key = 'function:get_user_tenant_id' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:financial_transactions","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:prevent_approved_edit' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:financial_transactions","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:set_manual_flag' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:financial_transactions","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:generate_receipt_number' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:commitments","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:enforce_commitment_status_transition' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:in_app_notifications","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:trigger_dispatch_notification' AND relationships = '[]'::jsonb;
