
UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:in_app_notifications","relation_type":"queries","weight":8}
]'::jsonb WHERE node_key = 'component:NotificationBell' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:system_knowledge_graph","relation_type":"queries","weight":8}
]'::jsonb WHERE node_key = 'component:KnowledgeDashboard' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"component:AppLayout","relation_type":"contained_in","weight":8}
]'::jsonb WHERE node_key = 'component:BottomNav' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:loans","relation_type":"queries","weight":8},
  {"target_key":"table:clients","relation_type":"queries","weight":8}
]'::jsonb WHERE node_key = 'component:GovernanceCore' AND relationships = '[]'::jsonb;

UPDATE system_knowledge_graph SET relationships = '[
  {"target_key":"table:clients","relation_type":"writes","weight":8}
]'::jsonb WHERE node_key = 'component:BulkOnboarding' AND relationships = '[]'::jsonb;
