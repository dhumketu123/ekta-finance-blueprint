
-- Remove duplicate triggers on ledger_entries (keep trg_ prefixed versions as standard)
DROP TRIGGER IF EXISTS anomaly_detection_trigger ON public.ledger_entries;
DROP TRIGGER IF EXISTS ledger_entry_hash_chain_trigger ON public.ledger_entries;
