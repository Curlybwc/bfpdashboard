ALTER TABLE public.shifts ADD COLUMN is_flat_rate boolean NOT NULL DEFAULT false;
ALTER TABLE public.shifts ADD COLUMN flat_rate_amount numeric NULL;

-- Update validate_shift to allow total_hours = 0 for flat rate shifts (we'll use total_hours = 1 but just in case)
CREATE OR REPLACE FUNCTION public.validate_shift()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(NEW.is_flat_rate, false) AND NEW.total_hours <= 0 THEN
    RAISE EXCEPTION 'total_hours must be greater than 0';
  END IF;
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'end_time must be after start_time';
  END IF;
  RETURN NEW;
END;
$function$;