-- LOCAL exact undo only, for the captured body/grant baseline.
BEGIN;
GRANT EXECUTE ON FUNCTION public.decrement_treasury_balance(bigint,numeric) TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_treasury_balance(bigint,numeric) TO PUBLIC,anon,authenticated;
COMMIT;
