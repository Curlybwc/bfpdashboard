
DROP POLICY "System can insert activity logs" ON public.activity_log;

CREATE POLICY "Only admins can manually insert activity logs"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));
