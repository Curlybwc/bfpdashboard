ALTER TABLE public.shifts ADD COLUMN purpose text, ADD COLUMN invoice_no text, ADD COLUMN trade text, ADD COLUMN client_ref text;
ALTER TABLE public.worker_payments ADD COLUMN purpose text, ADD COLUMN invoice_no text, ADD COLUMN settlement_method text;
ALTER TABLE public.worker_payable_batches ADD COLUMN purpose text, ADD COLUMN invoice_no text;
ALTER TABLE public.projects ADD COLUMN client_ref text;
ALTER TABLE public.vendors ADD COLUMN client_ref text;
ALTER TABLE public.tasks ADD COLUMN client_ref text;
CREATE UNIQUE INDEX shifts_agent_client_ref ON public.shifts(client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX projects_agent_client_ref ON public.projects(client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX vendors_agent_client_ref ON public.vendors(client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX tasks_agent_client_ref ON public.tasks(client_ref) WHERE client_ref IS NOT NULL;
COMMENT ON COLUMN public.shifts.purpose IS 'Human-entered description of work/payment purpose; required by agent creates and the manual entry form. Existing historical and running clock entries may be NULL.';
CREATE FUNCTION public.agent_entry_locked(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM worker_payment_shifts l JOIN worker_payments p ON p.id=l.worker_payment_id WHERE l.shift_id=p_id AND p.status <> 'voided')
 OR EXISTS(SELECT 1 FROM worker_payable_batch_shifts l JOIN worker_payable_batches b ON b.id=l.payable_batch_id WHERE l.shift_id=p_id AND l.voided_at IS NULL AND (b.status <> 'voided' OR b.qb_bill_id IS NOT NULL OR b.qb_exported_at IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.agent_entry_locked(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_entry_locked(uuid) TO service_role;
CREATE FUNCTION public.agent_dashboard_write(p_action text,p_record jsonb,p_actor uuid,p_dry_run boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 r jsonb; old_r jsonb; rid uuid; sid uuid; bid uuid; wid uuid; pid uuid; cid uuid;
 total numeric; alloc_sum numeric; item jsonb; row_s public.shifts%ROWTYPE;
 task_row public.tasks%ROWTYPE; parent_id uuid; next_id uuid; seen uuid[] := '{}';
 duplicate boolean := false; ref text := p_record->>'client_ref';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND is_admin AND is_active) THEN RAISE EXCEPTION 'invalid_actor'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','service_role')::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('agent_dashboard_write',0));
 IF p_action IN ('create_time_entry','update_time_entry','delete_time_entry','mark_time_entries_paid','update_bill_status','delete_task') THEN
  LOCK TABLE shifts,worker_payment_shifts,worker_payable_batch_shifts,worker_payments,worker_payable_batches IN SHARE ROW EXCLUSIVE MODE;
 END IF;
 BEGIN
 IF ref IS NOT NULL AND p_action IN ('create_time_entry','create_project','create_vendor') THEN
  IF p_action='create_time_entry' THEN SELECT to_jsonb(s) INTO r FROM shifts s WHERE client_ref=ref;
  ELSIF p_action='create_project' THEN SELECT to_jsonb(p) INTO r FROM projects p WHERE client_ref=ref;
  ELSE SELECT to_jsonb(v) INTO r FROM vendors v WHERE client_ref=ref; END IF;
  duplicate := r IS NOT NULL;
 END IF;
 IF NOT duplicate THEN
 CASE p_action
 WHEN 'create_time_entry','update_time_entry','delete_time_entry' THEN
  rid := (p_record->>'id')::uuid;
  IF p_action <> 'create_time_entry' THEN
   SELECT * INTO row_s FROM shifts WHERE id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
   IF agent_entry_locked(rid) OR (row_s.clock_in_at IS NOT NULL AND row_s.clock_out_at IS NULL) THEN RAISE EXCEPTION 'entry_locked'; END IF;
  END IF;
  IF p_action='delete_time_entry' THEN
   r := jsonb_build_object('id',rid,'deleted',true);
   DELETE FROM shift_task_allocations WHERE shift_id=rid;
   DELETE FROM shifts WHERE id=rid;
  ELSE
   IF p_action='update_time_entry' THEN p_record:=to_jsonb(row_s)||p_record; END IF;
   IF nullif(btrim(p_record->>'purpose'),'') IS NULL THEN RAISE EXCEPTION 'missing_purpose'; END IF;
   wid := (p_record->>'user_id')::uuid; pid := (p_record->>'project_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM profiles w JOIN projects p ON p.id=pid WHERE w.id=wid AND w.org_id=p.org_id AND w.org_id=(SELECT org_id FROM profiles WHERE id=p_actor)) THEN RAISE EXCEPTION 'invalid_worker'; END IF;
   IF (p_record->>'is_flat_rate')::boolean THEN
    IF COALESCE((p_record->>'flat_rate_amount')::numeric,0)<=0 THEN RAISE EXCEPTION 'invalid_flat_rate'; END IF;
    p_record:=p_record||jsonb_build_object('total_hours',NULL,'start_time',NULL,'end_time',NULL,'hourly_rate_snapshot',NULL);
   ELSE
    total := (p_record->>'total_hours')::numeric;
    IF total IS NULL OR total<=0 THEN RAISE EXCEPTION 'invalid_hours'; END IF;
    IF p_record ? 'allocations' THEN
     SELECT COALESCE(sum((a->>'hours')::numeric),0) INTO alloc_sum FROM jsonb_array_elements(p_record->'allocations') a;
    ELSE
     SELECT COALESCE(sum(hours),0) INTO alloc_sum FROM shift_task_allocations WHERE shift_id=rid;
    END IF;
    IF alloc_sum <> total THEN RAISE EXCEPTION 'allocations_required'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_record->'allocations','[]')) LOOP
     IF (item->>'hours')::numeric<=0 OR NOT EXISTS(SELECT 1 FROM tasks WHERE id=(item->>'task_id')::uuid AND project_id=pid) THEN RAISE EXCEPTION 'invalid_allocations'; END IF;
    END LOOP;
    IF NOT (p_record ? 'allocations') AND EXISTS(SELECT 1 FROM shift_task_allocations a JOIN tasks t ON t.id=a.task_id WHERE a.shift_id=rid AND t.project_id<>pid) THEN RAISE EXCEPTION 'invalid_allocations'; END IF;
    IF p_action='create_time_entry' OR wid<>row_s.user_id THEN
     p_record:=p_record||jsonb_build_object('hourly_rate_snapshot',(SELECT hourly_rate FROM profiles WHERE id=wid));
    END IF;
    IF p_record->>'hourly_rate_snapshot' IS NULL THEN RAISE EXCEPTION 'missing_rate'; END IF;
    p_record:=p_record||jsonb_build_object('flat_rate_amount',NULL);
   END IF;
   IF p_action='create_time_entry' THEN
    INSERT INTO shifts(user_id,project_id,shift_date,total_hours,hourly_rate_snapshot,is_flat_rate,flat_rate_amount,purpose,invoice_no,trade,client_ref,created_by,updated_by)
    VALUES(wid,pid,(p_record->>'shift_date')::date,(p_record->>'total_hours')::numeric,(p_record->>'hourly_rate_snapshot')::numeric,(p_record->>'is_flat_rate')::boolean,(p_record->>'flat_rate_amount')::numeric,p_record->>'purpose',p_record->>'invoice_no',p_record->>'trade',ref,p_actor,p_actor)
    RETURNING id INTO rid;
   ELSE
    UPDATE shifts SET user_id=wid,project_id=pid,shift_date=(p_record->>'shift_date')::date,total_hours=(p_record->>'total_hours')::numeric,
     hourly_rate_snapshot=(p_record->>'hourly_rate_snapshot')::numeric,is_flat_rate=(p_record->>'is_flat_rate')::boolean,flat_rate_amount=(p_record->>'flat_rate_amount')::numeric,
     start_time=(p_record->>'start_time')::time,end_time=(p_record->>'end_time')::time,purpose=p_record->>'purpose',invoice_no=p_record->>'invoice_no',trade=p_record->>'trade',updated_by=p_actor,admin_edited_by=p_actor,admin_edited_at=now() WHERE id=rid;
   END IF;
   IF (p_record->>'is_flat_rate')::boolean OR p_record ? 'allocations' THEN
    DELETE FROM shift_task_allocations WHERE shift_id=rid;
    IF NOT (p_record->>'is_flat_rate')::boolean THEN
     INSERT INTO shift_task_allocations(shift_id,task_id,hours) SELECT rid,(a->>'task_id')::uuid,(a->>'hours')::numeric FROM jsonb_array_elements(p_record->'allocations') a;
    END IF;
   END IF;
   SELECT to_jsonb(s)||jsonb_build_object('allocations',COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id',task_id,'hours',hours)) FROM shift_task_allocations WHERE shift_id=rid),'[]')) INTO r FROM shifts s WHERE id=rid;
  END IF;
 WHEN 'mark_time_entries_paid' THEN
  IF jsonb_array_length(p_record->'entry_ids')=0 THEN RAISE EXCEPTION 'invalid_entry_ids'; END IF;
  r:='[]'::jsonb;
  FOR sid IN SELECT value::uuid FROM jsonb_array_elements_text(p_record->'entry_ids') ORDER BY value LOOP
   IF sid=ANY(seen) THEN RAISE EXCEPTION 'invalid_entry_ids'; END IF; seen:=array_append(seen,sid);
   SELECT * INTO row_s FROM shifts WHERE id=sid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
   IF agent_entry_locked(sid) OR (row_s.clock_in_at IS NOT NULL AND row_s.clock_out_at IS NULL) THEN RAISE EXCEPTION 'entry_locked'; END IF;
   SELECT company_id INTO cid FROM projects WHERE id=row_s.project_id;
   IF cid IS NULL THEN RAISE EXCEPTION 'invalid_company'; END IF;
   total:=CASE WHEN row_s.is_flat_rate THEN row_s.flat_rate_amount ELSE round(row_s.total_hours*COALESCE(row_s.hourly_rate_snapshot,(SELECT hourly_rate FROM profiles WHERE id=row_s.user_id)),2) END;
   IF total IS NULL OR total<=0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
   INSERT INTO worker_payments(worker_user_id,project_id,company_id,amount,status,payment_source,paid_date,paid_at,marked_paid_by,created_by,external_reference,memo,purpose,invoice_no,settlement_method,pay_period_start,pay_period_end)
   VALUES(row_s.user_id,row_s.project_id,cid,total,'paid','manual_quickbooks',(p_record->>'paid_at')::date,(p_record->>'paid_at')::date,p_actor,p_actor,p_record->>'reference',row_s.purpose,row_s.purpose,row_s.invoice_no,p_record->>'settlement_method',row_s.shift_date,row_s.shift_date) RETURNING id INTO bid;
   INSERT INTO worker_payment_shifts(worker_payment_id,shift_id,hours_paid,hourly_rate_used,amount_paid)
   VALUES(bid,sid,COALESCE(row_s.total_hours,0),COALESCE(row_s.hourly_rate_snapshot,0),total);
   r:=r||jsonb_build_array((SELECT to_jsonb(p)||jsonb_build_object('entry_id',sid) FROM worker_payments p WHERE id=bid));
  END LOOP;
  r:=jsonb_build_object('payments',r,'entry_ids',p_record->'entry_ids','moves_money',false);
 WHEN 'update_bill_status' THEN
  rid:=(p_record->>'id')::uuid;
  SELECT to_jsonb(b) INTO old_r FROM worker_payable_batches b WHERE id=rid FOR UPDATE;
  IF old_r IS NULL THEN RAISE EXCEPTION 'bill_not_found'; END IF;
  IF old_r->>'status'='voided' OR (old_r->>'status'='paid' AND COALESCE(p_record->>'status','paid')<>'paid') THEN RAISE EXCEPTION 'entry_locked'; END IF;
  IF p_record->>'status'='voided' THEN RAISE EXCEPTION 'unsupported_status'; END IF;
  IF p_record->>'status'='draft' AND (old_r->>'qb_bill_id' IS NOT NULL OR old_r->>'qb_exported_at' IS NOT NULL OR old_r->>'status'='exported') THEN RAISE EXCEPTION 'entry_locked'; END IF;
  p_record:=old_r||p_record;
  UPDATE worker_payable_batches SET status=p_record->>'status',qb_bill_doc_number=p_record->>'qb_bill_doc_number',settlement_method=p_record->>'settlement_method',
   paid_at=CASE WHEN p_record->>'status'='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,
   marked_paid_by=CASE WHEN p_record->>'status'='paid' THEN p_actor ELSE marked_paid_by END WHERE id=rid RETURNING to_jsonb(worker_payable_batches) INTO r;
 WHEN 'create_project' THEN
  LOCK TABLE projects IN SHARE ROW EXCLUSIVE MODE;
  SELECT to_jsonb(p) INTO r FROM projects p WHERE org_id=(p_record->>'org_id')::uuid AND lower(btrim(name))=lower(btrim(p_record->>'name')) LIMIT 1;
  IF r IS NOT NULL THEN duplicate:=true;
  ELSE
   INSERT INTO projects(name,address,company_id,property_id,org_id,client_ref) VALUES(p_record->>'name',p_record->>'name',(p_record->>'company_id')::uuid,(p_record->>'property_id')::uuid,(p_record->>'org_id')::uuid,ref) RETURNING to_jsonb(projects) INTO r;
  END IF;
 WHEN 'update_project' THEN
  rid:=(p_record->>'id')::uuid;
  SELECT to_jsonb(p) INTO old_r FROM projects p WHERE id=rid FOR UPDATE;
  IF old_r IS NULL THEN RAISE EXCEPTION 'invalid_project'; END IF;
  IF p_record ? 'name' AND EXISTS(SELECT 1 FROM projects WHERE id<>rid AND org_id=(old_r->>'org_id')::uuid AND lower(btrim(name))=lower(btrim(p_record->>'name'))) THEN RAISE EXCEPTION 'project_duplicate'; END IF;
  p_record:=old_r||p_record;
  UPDATE projects SET name=p_record->>'name',status=(p_record->>'status')::project_status WHERE id=rid RETURNING to_jsonb(projects) INTO r;
 WHEN 'add_project_member' THEN
  INSERT INTO project_members(project_id,user_id,role) VALUES((p_record->>'project_id')::uuid,(p_record->>'user_id')::uuid,'contractor') ON CONFLICT(project_id,user_id) DO NOTHING;
  SELECT to_jsonb(m) INTO r FROM project_members m WHERE project_id=(p_record->>'project_id')::uuid AND user_id=(p_record->>'user_id')::uuid;
 WHEN 'remove_project_member' THEN
  DELETE FROM project_members WHERE project_id=(p_record->>'project_id')::uuid AND user_id=(p_record->>'user_id')::uuid;
  r:=p_record||jsonb_build_object('removed',true);
 WHEN 'update_worker' THEN
  rid:=(p_record->>'id')::uuid;
  SELECT to_jsonb(p) INTO old_r FROM profiles p WHERE id=rid FOR UPDATE;
  IF old_r IS NULL THEN RAISE EXCEPTION 'invalid_worker'; END IF;
  IF (old_r->>'is_admin')::boolean AND (p_record->>'is_admin'='false' OR p_record->>'is_active'='false') AND NOT EXISTS(SELECT 1 FROM profiles WHERE id<>rid AND org_id=(old_r->>'org_id')::uuid AND is_admin AND is_active) THEN RAISE EXCEPTION 'last_admin'; END IF;
  p_record:=old_r||p_record;
  UPDATE profiles SET full_name=p_record->>'full_name',hourly_rate=(p_record->>'hourly_rate')::numeric,is_active=(p_record->>'is_active')::boolean,is_admin=(p_record->>'is_admin')::boolean,can_manage_projects=(p_record->>'can_manage_projects')::boolean,skip_qb_export=(p_record->>'skip_qb_export')::boolean,dd_on_file=(p_record->>'dd_on_file')::boolean,tax_info_filed=(p_record->>'tax_info_filed')::boolean WHERE id=rid RETURNING to_jsonb(profiles) INTO r;
 WHEN 'update_task','complete_task','delete_task' THEN
  rid:=(p_record->>'id')::uuid;
  SELECT * INTO task_row FROM tasks WHERE id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  IF p_action='delete_task' THEN
   IF EXISTS(WITH RECURSIVE tree AS (SELECT id FROM tasks WHERE id=rid UNION ALL SELECT t.id FROM tasks t JOIN tree ON t.parent_task_id=tree.id)
    SELECT 1 FROM shift_task_allocations a JOIN tree ON tree.id=a.task_id WHERE agent_entry_locked(a.shift_id)) THEN RAISE EXCEPTION 'entry_locked'; END IF;
   SELECT jsonb_build_object('id',rid,'deleted',true,'cascade_task_ids',(WITH RECURSIVE tree AS (SELECT id FROM tasks WHERE id=rid UNION ALL SELECT t.id FROM tasks t JOIN tree ON t.parent_task_id=tree.id) SELECT jsonb_agg(id) FROM tree)) INTO r;
   DELETE FROM tasks WHERE id=rid;
  ELSE
   p_record:=to_jsonb(task_row)||p_record;
   IF p_action='complete_task' THEN p_record:=p_record||jsonb_build_object('stage','Done'); END IF;
   UPDATE tasks SET task=p_record->>'task',stage=(p_record->>'stage')::task_stage,priority=(p_record->>'priority')::task_priority,due_date=(p_record->>'due_date')::date,trade=p_record->>'trade',assigned_to_user_id=(p_record->>'assigned_to_user_id')::uuid,
    started_at=CASE WHEN p_record->>'stage'='In Progress' THEN COALESCE(started_at,now()) ELSE started_at END,
    started_by_user_id=CASE WHEN p_record->>'stage'='In Progress' THEN COALESCE(started_by_user_id,p_actor) ELSE started_by_user_id END,
    completed_at=CASE WHEN p_record->>'stage'='Done' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=rid;
   IF p_record->>'stage'='Done' AND task_row.stage<>'Done' AND task_row.is_recurring THEN next_id:=complete_recurring_task(rid); END IF;
   parent_id:=task_row.parent_task_id;
   WHILE parent_id IS NOT NULL LOOP
    SELECT * INTO task_row FROM tasks WHERE id=parent_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM tasks WHERE parent_task_id=parent_id AND stage<>'Done') THEN
     UPDATE tasks SET stage='Done',completed_at=COALESCE(completed_at,now()) WHERE id=parent_id;
    ELSIF task_row.stage='Done' THEN UPDATE tasks SET stage='In Progress',completed_at=NULL WHERE id=parent_id;
    ELSE EXIT; END IF;
    parent_id:=task_row.parent_task_id;
   END LOOP;
   SELECT to_jsonb(t)||jsonb_build_object('next_recurring_task_id',next_id) INTO r FROM tasks t WHERE id=rid;
  END IF;
 WHEN 'create_vendor' THEN
  INSERT INTO vendors(name,company_id,created_by,client_ref) VALUES(p_record->>'name',(p_record->>'company_id')::uuid,p_actor,ref) RETURNING to_jsonb(vendors) INTO r;
 WHEN 'update_vendor' THEN
  rid:=(p_record->>'id')::uuid;
  SELECT to_jsonb(v) INTO old_r FROM vendors v WHERE id=rid FOR UPDATE;
  IF old_r IS NULL THEN RAISE EXCEPTION 'invalid_vendor'; END IF;
  p_record:=old_r||p_record;
  UPDATE vendors SET name=p_record->>'name',quickbooks_vendor_id=p_record->>'quickbooks_vendor_id',quickbooks_display_name=p_record->>'quickbooks_display_name',quickbooks_sync_status=CASE WHEN p_record->>'quickbooks_vendor_id' IS NULL THEN 'not_synced' ELSE 'synced' END WHERE id=rid RETURNING to_jsonb(vendors) INTO r;
 ELSE RAISE EXCEPTION 'unsupported_action';
 END CASE;
 END IF;
 IF p_dry_run THEN RAISE SQLSTATE 'PT001'; END IF;
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
 IF p_dry_run THEN RETURN jsonb_build_object('dry_run',true,'would_save',r,'saved',false)||CASE WHEN duplicate THEN '{"duplicate":true}'::jsonb ELSE '{}'::jsonb END; END IF;
 RETURN jsonb_build_object('saved',NOT duplicate,'record',r)||CASE WHEN duplicate THEN '{"duplicate":true}'::jsonb ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_dashboard_write(text,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_dashboard_write(text,jsonb,uuid,boolean) TO service_role;
CREATE FUNCTION public.save_shift_with_purpose(p_shift_id uuid,p_user_id uuid,p_project_id uuid,p_shift_date date,p_start_time time,p_end_time time,p_total_hours numeric,p_allocations jsonb,p_is_admin_edit boolean,p_is_flat_rate boolean,p_flat_rate_amount numeric,p_purpose text,p_invoice_no text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF nullif(btrim(p_purpose),'') IS NULL THEN RAISE EXCEPTION 'missing_purpose'; END IF;
 result:=public.upsert_shift_with_allocations(p_shift_id,p_user_id,p_project_id,p_shift_date,p_start_time,p_end_time,p_total_hours,p_allocations,p_is_admin_edit,p_is_flat_rate,p_flat_rate_amount);
 UPDATE public.shifts SET purpose=btrim(p_purpose),invoice_no=nullif(btrim(p_invoice_no),'') WHERE id=(result->>'shift_id')::uuid;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_shift_with_purpose(uuid,uuid,uuid,date,time,time,numeric,jsonb,boolean,boolean,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_shift_with_purpose(uuid,uuid,uuid,date,time,time,numeric,jsonb,boolean,boolean,numeric,text,text) TO authenticated,service_role;