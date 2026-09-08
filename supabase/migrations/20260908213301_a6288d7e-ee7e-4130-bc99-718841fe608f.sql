CREATE OR REPLACE FUNCTION public.upsert_shift_with_allocations(p_shift_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_shift_date date DEFAULT NULL::date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_total_hours numeric DEFAULT NULL::numeric, p_allocations jsonb DEFAULT '[]'::jsonb, p_is_admin_edit boolean DEFAULT false, p_is_flat_rate boolean DEFAULT false, p_flat_rate_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift_id uuid;
  v_total_hours numeric;
  v_alloc_sum numeric;
  v_hourly_rate numeric;
  v_caller uuid;
  v_alloc jsonb;
  v_task_project uuid;
  v_existing_date date;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NULL THEN
    p_user_id := v_caller;
  END IF;

  IF NOT is_admin(v_caller) AND p_user_id != v_caller THEN
    RAISE EXCEPTION 'Cannot create/edit shifts for other users';
  END IF;

  -- Non-admins: rolling window of today through 7 calendar days ago
  IF NOT is_admin(v_caller) THEN
    IF p_shift_date > current_date THEN
      RAISE EXCEPTION 'Shift date cannot be in the future';
    END IF;
    IF p_shift_date < current_date - 7 THEN
      RAISE EXCEPTION 'Shifts older than 7 days are locked. Ask an admin to make changes.';
    END IF;
    IF p_shift_id IS NOT NULL THEN
      SELECT shift_date INTO v_existing_date FROM public.shifts WHERE id = p_shift_id;
      IF v_existing_date IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
      END IF;
      IF v_existing_date < current_date - 7 OR v_existing_date > current_date THEN
        RAISE EXCEPTION 'Shifts older than 7 days are locked. Ask an admin to make changes.';
      END IF;
    END IF;
  END IF;

  IF p_is_flat_rate THEN
    IF p_flat_rate_amount IS NULL OR p_flat_rate_amount <= 0 THEN
      RAISE EXCEPTION 'Flat rate amount must be positive';
    END IF;
    v_total_hours := 0;
  ELSE
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
  END IF;

  v_total_hours := round(v_total_hours, 2);

  IF NOT p_is_flat_rate THEN
    SELECT COALESCE(SUM((a->>'hours')::numeric), 0) INTO v_alloc_sum
    FROM jsonb_array_elements(p_allocations) a;
    v_alloc_sum := round(v_alloc_sum, 2);

    IF v_alloc_sum != v_total_hours THEN
      RAISE EXCEPTION 'Allocation sum (%) does not equal total hours (%)', v_alloc_sum, v_total_hours;
    END IF;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
      IF (v_alloc->>'hours')::numeric <= 0 THEN
        RAISE EXCEPTION 'Each allocation must have hours > 0';
      END IF;
    END LOOP;

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
  END IF;

  SELECT hourly_rate INTO v_hourly_rate
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_shift_id IS NOT NULL THEN
    UPDATE public.shifts SET
      user_id = p_user_id,
      project_id = p_project_id,
      shift_date = p_shift_date,
      start_time = CASE WHEN p_is_flat_rate THEN NULL ELSE p_start_time END,
      end_time = CASE WHEN p_is_flat_rate THEN NULL ELSE p_end_time END,
      total_hours = v_total_hours,
      hourly_rate_snapshot = CASE WHEN p_is_flat_rate THEN NULL ELSE COALESCE(v_hourly_rate, hourly_rate_snapshot) END,
      is_flat_rate = p_is_flat_rate,
      flat_rate_amount = CASE WHEN p_is_flat_rate THEN p_flat_rate_amount ELSE NULL END,
      updated_by = v_caller,
      admin_edited_at = CASE WHEN p_is_admin_edit THEN now() ELSE admin_edited_at END,
      admin_edited_by = CASE WHEN p_is_admin_edit THEN v_caller ELSE admin_edited_by END
    WHERE id = p_shift_id
    RETURNING id INTO v_shift_id;

    IF v_shift_id IS NULL THEN
      RAISE EXCEPTION 'Shift not found';
    END IF;
  ELSE
    IF p_is_flat_rate THEN
      INSERT INTO public.shifts (
        user_id, project_id, shift_date, total_hours,
        is_flat_rate, flat_rate_amount,
        created_by, updated_by
      ) VALUES (
        p_user_id, p_project_id, p_shift_date, v_total_hours,
        true, p_flat_rate_amount,
        v_caller, v_caller
      )
      RETURNING id INTO v_shift_id;
    ELSE
      INSERT INTO public.shifts (
        user_id, project_id, shift_date, start_time, end_time,
        total_hours, hourly_rate_snapshot, created_by, updated_by,
        admin_edited_at, admin_edited_by
      ) VALUES (
        p_user_id, p_project_id, p_shift_date, p_start_time, p_end_time,
        v_total_hours, v_hourly_rate, v_caller, v_caller,
        CASE WHEN p_is_admin_edit THEN now() ELSE NULL END,
        CASE WHEN p_is_admin_edit THEN v_caller ELSE NULL END
      )
      RETURNING id INTO v_shift_id;
    END IF;
  END IF;

  DELETE FROM public.shift_task_allocations WHERE shift_id = v_shift_id;

  IF NOT p_is_flat_rate THEN
    INSERT INTO public.shift_task_allocations (shift_id, task_id, hours)
    SELECT v_shift_id, (a->>'task_id')::uuid, (a->>'hours')::numeric
    FROM jsonb_array_elements(p_allocations) a;
  END IF;

  RETURN jsonb_build_object(
    'shift_id', v_shift_id,
    'total_hours', v_total_hours,
    'hourly_rate_snapshot', v_hourly_rate,
    'is_flat_rate', p_is_flat_rate,
    'flat_rate_amount', p_flat_rate_amount,
    'allocation_count', CASE WHEN p_is_flat_rate THEN 0 ELSE jsonb_array_length(p_allocations) END
  );
END;
$function$;

-- shifts policies
DROP POLICY IF EXISTS "Insert own shifts past or today or admin" ON public.shifts;
CREATE POLICY "Insert own shifts within 7 day window or admin"
ON public.shifts FOR INSERT TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR (user_id = auth.uid() AND shift_date <= CURRENT_DATE AND shift_date >= CURRENT_DATE - 7)
);

DROP POLICY IF EXISTS "Update own past or today shifts or admin" ON public.shifts;
CREATE POLICY "Update own shifts within 7 day window or admin"
ON public.shifts FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid())
  OR (user_id = auth.uid() AND shift_date <= CURRENT_DATE AND shift_date >= CURRENT_DATE - 7)
)
WITH CHECK (
  is_admin(auth.uid())
  OR (user_id = auth.uid() AND shift_date <= CURRENT_DATE AND shift_date >= CURRENT_DATE - 7)
);

DROP POLICY IF EXISTS "Delete shifts admin only" ON public.shifts;
CREATE POLICY "Delete own shifts within 7 day window or admin"
ON public.shifts FOR DELETE TO authenticated
USING (
  is_admin(auth.uid())
  OR (user_id = auth.uid() AND shift_date <= CURRENT_DATE AND shift_date >= CURRENT_DATE - 7)
);

-- allocation policies follow the same window
DROP POLICY IF EXISTS "Insert allocations via shift access" ON public.shift_task_allocations;
CREATE POLICY "Insert allocations via shift access"
ON public.shift_task_allocations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.id = shift_task_allocations.shift_id
    AND (is_admin(auth.uid()) OR (s.user_id = auth.uid() AND s.shift_date <= CURRENT_DATE AND s.shift_date >= CURRENT_DATE - 7))
));

DROP POLICY IF EXISTS "Update allocations via shift access" ON public.shift_task_allocations;
CREATE POLICY "Update allocations via shift access"
ON public.shift_task_allocations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.id = shift_task_allocations.shift_id
    AND (is_admin(auth.uid()) OR (s.user_id = auth.uid() AND s.shift_date <= CURRENT_DATE AND s.shift_date >= CURRENT_DATE - 7))
));

DROP POLICY IF EXISTS "Delete allocations via shift access" ON public.shift_task_allocations;
CREATE POLICY "Delete allocations via shift access"
ON public.shift_task_allocations FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.id = shift_task_allocations.shift_id
    AND (is_admin(auth.uid()) OR (s.user_id = auth.uid() AND s.shift_date <= CURRENT_DATE AND s.shift_date >= CURRENT_DATE - 7))
));