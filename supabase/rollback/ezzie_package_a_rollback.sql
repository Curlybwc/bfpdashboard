-- ============================================================
-- Ezzie Package A — Shared Core Seed: PRODUCTION ROLLBACK
-- Backend ref: fuwjacbhgkgibdvjwryr
-- DO NOT EXECUTE unless the Package A migration must be reverted.
--
-- Reverses, in order:
--   1. Package A tables (drops data + link FK dependencies)
--   2. The three added nullable link columns
--   3. The four Shared Core helper functions
--
-- NOTE: the four linked projects' updated_at timestamps were changed by the
-- existing projects updated_at trigger during backfill. This rollback does
-- NOT restore those timestamps.
-- ============================================================

BEGIN;

-- 1. Package A tables (children first; CASCADE covers indexes/policies/triggers)
DROP TABLE IF EXISTS public.property_external_ids CASCADE;
DROP TABLE IF EXISTS public.organization_external_ids CASCADE;
DROP TABLE IF EXISTS public.person_external_ids CASCADE;
DROP TABLE IF EXISTS public.property_organization_relationships CASCADE;
DROP TABLE IF EXISTS public.units CASCADE;
DROP TABLE IF EXISTS public.organization_person_roles CASCADE;
DROP TABLE IF EXISTS public.organization_relationships CASCADE;
DROP TABLE IF EXISTS public.person_auth_identities CASCADE;
DROP TABLE IF EXISTS public.person_contact_methods CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;
DROP TABLE IF EXISTS public.business_organizations CASCADE;
DROP TABLE IF EXISTS public.people CASCADE;

-- 2. Added nullable link columns on existing tables
DROP INDEX IF EXISTS public.idx_projects_property;
DROP INDEX IF EXISTS public.idx_companies_business_org;
DROP INDEX IF EXISTS public.idx_profiles_person;
ALTER TABLE public.projects  DROP COLUMN IF EXISTS property_id;
ALTER TABLE public.companies DROP COLUMN IF EXISTS business_organization_id;
ALTER TABLE public.profiles  DROP COLUMN IF EXISTS person_id;

-- 3. Helper functions
DROP FUNCTION IF EXISTS public.can_view_business_organization(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_view_person(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_view_property(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_shared_core_admin(uuid);

COMMIT;
