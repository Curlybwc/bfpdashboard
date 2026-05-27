
-- 1. Schema: nullable project/total_hours + clock timestamps
ALTER TABLE public.shifts
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN total_hours DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS clock_in_at  timestamptz,
  ADD COLUMN IF NOT EXISTS clock_out_at timestamptz;

-- 2. Only one open shift per user
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_user
  ON public.shifts (user_id)
  WHERE clock_in_at IS NOT NULL AND clock_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_open_by_user
  ON public.shifts (user_id, clock_in_at DESC)
  WHERE clock_out_at IS NULL;

-- 3. Rewrite validation trigger to allow open shifts
CREATE OR REPLACE FUNCTION public.validate_shift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_hours IS NOT NULL AND NEW.total_hours <= 0 THEN
    RAISE EXCEPTION 'total_hours must be greater than 0';
  END IF;
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;
  IF NEW.clock_in_at IS NOT NULL AND NEW.clock_out_at IS NOT NULL AND NEW.clock_out_at < NEW.clock_in_at THEN
    RAISE EXCEPTION 'clock_out_at must be at or after clock_in_at';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. clock_in RPC
CREATE OR REPLACE FUNCTION public.clock_in()
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    public.shifts;
  v_rate   numeric;
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

  SELECT hourly_rate INTO v_rate FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.shifts (
    user_id, shift_date, clock_in_at,
    project_id, total_hours,
    hourly_rate_snapshot, created_by, updated_by
  ) VALUES (
    v_caller,
    (now() AT TIME ZONE 'utc')::date,
    now(),
    NULL, NULL,
    v_rate, v_caller, v_caller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in() TO authenticated;

-- 5. clock_out RPC (race-safe: UPDATE itself enforces ownership + open state)
CREATE OR REPLACE FUNCTION public.clock_out()
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    public.shifts;
  v_hours  numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH target AS (
    SELECT id, clock_in_at
    FROM public.shifts
    WHERE user_id = v_caller
      AND clock_in_at IS NOT NULL
      AND clock_out_at IS NULL
    ORDER BY clock_in_at DESC
    LIMIT 1
  )
  UPDATE public.shifts s
     SET clock_out_at = now(),
         total_hours  = GREATEST(round(extract(epoch FROM (now() - t.clock_in_at)) / 3600.0, 2), 0.01),
         updated_by   = v_caller
    FROM target t
   WHERE s.id = t.id
     AND s.user_id = v_caller
     AND s.clock_in_at IS NOT NULL
     AND s.clock_out_at IS NULL
  RETURNING s.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active shift';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out() TO authenticated;
