
DROP TRIGGER IF EXISTS trg_clients_cross_role_guard ON public.clients;
DROP TRIGGER IF EXISTS trg_investors_cross_role_guard ON public.investors;

CREATE TRIGGER trg_clients_cross_role_guard
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.prevent_cross_role_duplicate();

CREATE TRIGGER trg_investors_cross_role_guard
BEFORE INSERT OR UPDATE ON public.investors
FOR EACH ROW EXECUTE FUNCTION public.prevent_cross_role_duplicate();
