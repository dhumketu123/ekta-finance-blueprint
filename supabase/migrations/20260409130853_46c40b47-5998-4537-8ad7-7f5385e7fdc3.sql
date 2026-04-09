
-- Role-check functions → user_roles
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:is_field_officer' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:user_roles","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:is_owner' AND relationships = '[]'::jsonb;

-- ID generators → their target tables
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:generate_year_based_client_id' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:generate_loan_id' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:generate_investor_id' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:investors","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:generate_owner_id' AND relationships = '[]'::jsonb;

-- Auth handler → profiles
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:profiles","relation_type":"writes","weight":9},
  {"target_key":"table:user_roles","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'function:handle_new_user' AND relationships = '[]'::jsonb;

-- Schema introspection functions (self-referential to system_knowledge_graph)
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"feeds","weight":8}
]'::jsonb WHERE node_key = 'function:get_schema_tables' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"feeds","weight":8}
]'::jsonb WHERE node_key = 'function:get_schema_triggers' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"feeds","weight":8}
]'::jsonb WHERE node_key = 'function:get_schema_functions' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"feeds","weight":8}
]'::jsonb WHERE node_key = 'function:get_function_dependencies' AND relationships = '[]'::jsonb;

-- AI/analytics functions
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":9},
  {"target_key":"table:clients","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'function:refresh_ai_system_health' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":9},
  {"target_key":"table:financial_transactions","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'function:refresh_ai_dashboard_metrics' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'function:fn_generate_ai_insights_core' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:double_entry_ledger","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'function:get_trial_balance_fast' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:double_entry_ledger","relation_type":"reads","weight":9}
]'::jsonb WHERE node_key = 'function:refresh_trial_balance_mv' AND relationships = '[]'::jsonb;

-- Notification functions
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:in_app_notifications","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'function:send_push_notification' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:in_app_notifications","relation_type":"writes","weight":9}
]'::jsonb WHERE node_key = 'function:notify_dashboard_strip' AND relationships = '[]'::jsonb;

-- Utility/config functions
UPDATE system_knowledge_graph SET relationships = '[]'::jsonb 
WHERE node_key = 'function:get_server_time' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:chart_of_accounts","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:validate_coa_account_type' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'function:fn_fetch_ai_knowledge' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"reads","weight":8}
]'::jsonb WHERE node_key = 'function:get_governance_policy_config' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"depends_on","weight":9}
]'::jsonb WHERE node_key = 'function:fn_system_dna_auto_version' AND relationships = '[]'::jsonb;
