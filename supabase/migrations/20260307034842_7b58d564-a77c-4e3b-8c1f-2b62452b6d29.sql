
-- Create worker_availability table
CREATE TABLE public.worker_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_worker_availability_user_date ON public.worker_availability(user_id, available_date);
CREATE INDEX idx_worker_availability_date ON public.worker_availability(available_date);

-- Validation trigger (use trigger instead of CHECK per project guidelines)
CREATE OR REPLACE FUNCTION public.validate_worker_availability()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_worker_availability_trigger
  BEFORE INSERT OR UPDATE ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.validate_worker_availability();

-- Reuse existing updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.worker_availability ENABLE ROW LEVEL SECURITY;

-- Workers CRUD own rows
CREATE POLICY "Users select own availability"
  ON public.worker_availability FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own availability"
  ON public.worker_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own availability"
  ON public.worker_availability FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own availability"
  ON public.worker_availability FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins read all
CREATE POLICY "Admins select all availability"
  ON public.worker_availability FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));
