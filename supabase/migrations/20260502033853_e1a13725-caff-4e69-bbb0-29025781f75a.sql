INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('37f10ad3-0fce-4eb4-9577-5175ce2dedde', '02df862a-05ea-4498-8282-79c4784a0d6c', 'member')
ON CONFLICT DO NOTHING;

UPDATE public.profiles
SET org_id = '37f10ad3-0fce-4eb4-9577-5175ce2dedde'
WHERE id = '02df862a-05ea-4498-8282-79c4784a0d6c';

DELETE FROM public.org_members
WHERE user_id = '02df862a-05ea-4498-8282-79c4784a0d6c'
  AND org_id = '7fefa5f9-6fd1-45b3-8b63-16cbcbe13513';