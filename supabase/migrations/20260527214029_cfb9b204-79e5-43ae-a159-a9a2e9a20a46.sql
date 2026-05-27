
-- Replace clock_in() with an overload that accepts an optional project id.
-- Drop old zero-arg version first to avoid ambiguity.
DROP FUNCTION IF EXISTS public.clock_in();

CREATE OR REPLACE FUNCTION public.clock_in(p_project_id uuid DEFAULT NULL)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    public.shifts;
  v_rate   numeric;
  v_is_member boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shifts
    WHERE user_id = v_caller
      AND clock_in_at IS NOT NULL
      AND clock_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already clocked in';
  END IF;

  IF p_project_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = p_project_id AND user_id = v_caller
    ) INTO v_is_member;
    IF NOT v_is_member THEN
      RAISE EXCEPTION 'Not a member of selected project';
    END IF;
  END IF;

  SELECT hourly_rate INTO v_rate FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.shifts (
    user_id, shift_date, clock_in_at,
    project_id, total_hours,
    hourly_rate_snapshot, created_by, updated_by
  ) VALUES (
    v_caller,
    (now() AT TIME ZONE 'utc')::date,
    now(),
    p_project_id, NULL,
    v_rate, v_caller, v_caller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in(uuid) TO authenticated;
