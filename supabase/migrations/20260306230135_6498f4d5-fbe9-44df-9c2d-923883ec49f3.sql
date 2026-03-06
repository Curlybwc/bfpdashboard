
-- 1. Add hourly_rate to profiles
ALTER TABLE public.profiles ADD COLUMN hourly_rate numeric NULL;

-- 2. Create shifts table
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NULL,
  end_time time NULL,
  total_hours numeric NOT NULL,
  hourly_rate_snapshot numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  admin_edited_at timestamptz NULL,
  admin_edited_by uuid NULL,
  UNIQUE(user_id, project_id, shift_date)
);

CREATE INDEX idx_shifts_user_date ON public.shifts(user_id, shift_date);
CREATE INDEX idx_shifts_project_date ON public.shifts(project_id, shift_date);

-- Validation trigger for shifts
CREATE OR REPLACE FUNCTION public.validate_shift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_hours <= 0 THEN
    RAISE EXCEPTION 'total_hours must be greater than 0';
  END IF;
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_shift_trigger
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.validate_shift();

-- updated_at trigger for shifts
CREATE TRIGGER shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create shift_task_allocations table
CREATE TABLE public.shift_task_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  hours numeric NOT NULL,
  UNIQUE(shift_id, task_id)
);

CREATE INDEX idx_sta_shift ON public.shift_task_allocations(shift_id);
CREATE INDEX idx_sta_task ON public.shift_task_allocations(task_id);

-- Validation trigger for allocation hours
CREATE OR REPLACE FUNCTION public.validate_shift_allocation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hours <= 0 THEN
    RAISE EXCEPTION 'allocation hours must be greater than 0';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_shift_allocation_trigger
  BEFORE INSERT OR UPDATE ON public.shift_task_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_shift_allocation();

-- 4. RLS on shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own shifts or admin"
  ON public.shifts FOR SELECT
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Insert own shifts within date window or admin"
  ON public.shifts FOR INSERT
  WITH CHECK (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND shift_date >= (current_date - 2)
    )
  );

CREATE POLICY "Update own current-day shifts or admin"
  ON public.shifts FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND shift_date = current_date
    )
  );

CREATE POLICY "Delete shifts admin only"
  ON public.shifts FOR DELETE
  USING (is_admin(auth.uid()));

-- 5. RLS on shift_task_allocations
ALTER TABLE public.shift_task_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select allocations via shift access"
  ON public.shift_task_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_allocations.shift_id
        AND (s.user_id = auth.uid() OR is_admin(auth.uid()))
    )
  );

CREATE POLICY "Insert allocations via shift access"
  ON public.shift_task_allocations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_allocations.shift_id
        AND (
          is_admin(auth.uid())
          OR (s.user_id = auth.uid() AND s.shift_date >= (current_date - 2))
        )
    )
  );

CREATE POLICY "Update allocations via shift access"
  ON public.shift_task_allocations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_allocations.shift_id
        AND (
          is_admin(auth.uid())
          OR (s.user_id = auth.uid() AND s.shift_date = current_date)
        )
    )
  );

CREATE POLICY "Delete allocations via shift access"
  ON public.shift_task_allocations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_allocations.shift_id
        AND (
          is_admin(auth.uid())
          OR (s.user_id = auth.uid() AND s.shift_date = current_date)
        )
    )
  );

-- 6. RPC: upsert_shift_with_allocations
CREATE OR REPLACE FUNCTION public.upsert_shift_with_allocations(
  p_shift_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_shift_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_total_hours numeric DEFAULT NULL,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_is_admin_edit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_id uuid;
  v_total_hours numeric;
  v_alloc_sum numeric;
  v_hourly_rate numeric;
  v_caller uuid;
  v_alloc jsonb;
  v_task_project uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Determine target user
  IF p_user_id IS NULL THEN
    p_user_id := v_caller;
  END IF;

  -- Permission check: non-admin can only write own shifts
  IF NOT is_admin(v_caller) AND p_user_id != v_caller THEN
    RAISE EXCEPTION 'Cannot create/edit shifts for other users';
  END IF;

  -- Non-admin date window check for inserts
  IF NOT is_admin(v_caller) AND p_shift_id IS NULL AND p_shift_date < (current_date - 2) THEN
    RAISE EXCEPTION 'Shift date too far in the past';
  END IF;

  -- Non-admin edit check: only current day
  IF NOT is_admin(v_caller) AND p_shift_id IS NOT NULL AND p_shift_date != current_date THEN
    RAISE EXCEPTION 'Can only edit current-day shifts';
  END IF;

  -- Calculate total_hours from start/end if both provided
  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
    IF p_end_time <= p_start_time THEN
      RAISE EXCEPTION 'end_time must be after start_time';
    END IF;
    v_total_hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;
  ELSIF p_total_hours IS NOT NULL THEN
    v_total_hours := p_total_hours;
  ELSE
    RAISE EXCEPTION 'Must provide start_time+end_time or total_hours';
  END IF;

  IF v_total_hours <= 0 THEN
    RAISE EXCEPTION 'total_hours must be greater than 0';
  END IF;

  -- Round to 2 decimals
  v_total_hours := round(v_total_hours, 2);

  -- Validate allocation sum
  SELECT COALESCE(SUM((a->>'hours')::numeric), 0) INTO v_alloc_sum
  FROM jsonb_array_elements(p_allocations) a;

  v_alloc_sum := round(v_alloc_sum, 2);

  IF v_alloc_sum != v_total_hours THEN
    RAISE EXCEPTION 'Allocation sum (%) does not equal total hours (%)', v_alloc_sum, v_total_hours;
  END IF;

  -- Validate all allocation hours > 0
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    IF (v_alloc->>'hours')::numeric <= 0 THEN
      RAISE EXCEPTION 'Each allocation must have hours > 0';
    END IF;
  END LOOP;

  -- Validate all tasks belong to the project
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    SELECT project_id INTO v_task_project
    FROM public.tasks
    WHERE id = (v_alloc->>'task_id')::uuid;

    IF v_task_project IS NULL THEN
      RAISE EXCEPTION 'Task % not found', v_alloc->>'task_id';
    END IF;
    IF v_task_project != p_project_id THEN
      RAISE EXCEPTION 'Task % does not belong to project %', v_alloc->>'task_id', p_project_id;
    END IF;
  END LOOP;

  -- Snapshot hourly rate
  SELECT hourly_rate INTO v_hourly_rate
  FROM public.profiles
  WHERE id = p_user_id;

  -- Upsert shift
  IF p_shift_id IS NOT NULL THEN
    -- Edit existing shift
    UPDATE public.shifts SET
      user_id = p_user_id,
      project_id = p_project_id,
      shift_date = p_shift_date,
      start_time = p_start_time,
      end_time = p_end_time,
      total_hours = v_total_hours,
      hourly_rate_snapshot = COALESCE(v_hourly_rate, hourly_rate_snapshot),
      updated_by = v_caller,
      admin_edited_at = CASE WHEN p_is_admin_edit THEN now() ELSE admin_edited_at END,
      admin_edited_by = CASE WHEN p_is_admin_edit THEN v_caller ELSE admin_edited_by END
    WHERE id = p_shift_id
    RETURNING id INTO v_shift_id;

    IF v_shift_id IS NULL THEN
      RAISE EXCEPTION 'Shift not found';
    END IF;
  ELSE
    -- Insert new shift (use ON CONFLICT for natural key safety)
    INSERT INTO public.shifts (
      user_id, project_id, shift_date, start_time, end_time,
      total_hours, hourly_rate_snapshot, created_by, updated_by
    ) VALUES (
      p_user_id, p_project_id, p_shift_date, p_start_time, p_end_time,
      v_total_hours, v_hourly_rate, v_caller, v_caller
    )
    ON CONFLICT (user_id, project_id, shift_date) DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      total_hours = EXCLUDED.total_hours,
      hourly_rate_snapshot = EXCLUDED.hourly_rate_snapshot,
      updated_by = EXCLUDED.updated_by,
      admin_edited_at = CASE WHEN p_is_admin_edit THEN now() ELSE shifts.admin_edited_at END,
      admin_edited_by = CASE WHEN p_is_admin_edit THEN v_caller ELSE shifts.admin_edited_by END
    RETURNING id INTO v_shift_id;
  END IF;

  -- Replace allocations
  DELETE FROM public.shift_task_allocations WHERE shift_id = v_shift_id;

  INSERT INTO public.shift_task_allocations (shift_id, task_id, hours)
  SELECT v_shift_id, (a->>'task_id')::uuid, (a->>'hours')::numeric
  FROM jsonb_array_elements(p_allocations) a;

  RETURN jsonb_build_object(
    'shift_id', v_shift_id,
    'total_hours', v_total_hours,
    'hourly_rate_snapshot', v_hourly_rate,
    'allocation_count', jsonb_array_length(p_allocations)
  );
END;
$$;
