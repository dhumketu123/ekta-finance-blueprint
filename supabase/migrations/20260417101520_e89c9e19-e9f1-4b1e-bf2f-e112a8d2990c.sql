ALTER FUNCTION public.execution_engine_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execution_engine_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v1(uuid) TO authenticated;

ALTER FUNCTION public.execute_stub_not_ready(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_stub_not_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_stub_not_ready(uuid) TO authenticated;