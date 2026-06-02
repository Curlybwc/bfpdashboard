
CREATE OR REPLACE FUNCTION public.admin_force_clock_out(p_shift_id uuid)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    public.shifts;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  UPDATE public.shifts s
     SET clock_out_at    = now(),
         total_hours     = GREATEST(round(extract(epoch FROM (now() - s.clock_in_at)) / 3600.0, 2), 0.01),
         updated_by      = v_caller,
         admin_edited_at = now(),
         admin_edited_by = v_caller
   WHERE s.id = p_shift_id
     AND s.clock_in_at IS NOT NULL
     AND s.clock_out_at IS NULL
  RETURNING s.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found or already closed';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_clock_out(uuid) TO authenticated;
