ALTER TABLE public.worker_payable_batches
  ADD COLUMN IF NOT EXISTS qb_matched_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS qb_matched_by uuid;

CREATE OR REPLACE FUNCTION public.mark_batch_qb_matched(
  p_batch_id uuid,
  p_matched boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can mark bills as matched in QuickBooks';
  END IF;

  IF p_matched THEN
    UPDATE public.worker_payable_batches
    SET qb_matched_at = now(),
        qb_matched_by = auth.uid()
    WHERE id = p_batch_id;
  ELSE
    UPDATE public.worker_payable_batches
    SET qb_matched_at = NULL,
        qb_matched_by = NULL
    WHERE id = p_batch_id;
  END IF;
END;
$$;