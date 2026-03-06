
-- Fix search_path on validation functions
CREATE OR REPLACE FUNCTION public.validate_shift()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.validate_shift_allocation()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.hours <= 0 THEN
    RAISE EXCEPTION 'allocation hours must be greater than 0';
  END IF;
  RETURN NEW;
END;
$$;
