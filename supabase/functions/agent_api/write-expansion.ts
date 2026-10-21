import { TASK_STAGES, TASK_PRIORITIES } from './validation.ts';
import { getConnectionForCompany, checkQBRef } from '../_shared/quickbooks.ts';

export const NEW_ACTIONS = ['create_time_entry','update_time_entry','delete_time_entry','mark_time_entries_paid','update_bill_status','create_project','update_project','add_project_member','remove_project_member','create_worker','update_worker','update_task','complete_task','delete_task','create_vendor','update_vendor'];
export class InputError extends Error {
  constructor(public code: string, message = code, public status = 400) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(v: unknown, field: string, nullable = false): string | null {
  if (nullable && v === null) return null;
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 2000) throw new InputError(`invalid_${field}`);
  return v.trim();
}
export function date(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v+'T00:00:00Z')) || new Date(v+'T00:00:00Z').toISOString().slice(0,10) !== v) throw new InputError(`invalid_${field}`);
  return v;
}
function number(v: unknown, field: string, zero = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || (zero ? v < 0 : v <= 0) || v > 100000000 || Math.abs(v * 100 - Math.round(v * 100)) > 0.000001) throw new InputError(`invalid_${field}`);
  return v;
}
function choice(v: unknown, field: string, values: readonly string[]): string {
  if (typeof v !== 'string' || !values.includes(v)) throw new InputError(`invalid_${field}`, `${field} must be one of: ${values.join(', ')}.`);
  return v;
}
export const SETTLEMENT_METHODS = ['bill_pay','check','direct_deposit','cash','other'] as const;
export function validateNewBody(b: Record<string, unknown>) {
  if (b.dry_run !== undefined && typeof b.dry_run !== 'boolean') throw new InputError('invalid_dry_run');
  if (b.client_ref !== undefined) {
    const value = text(b.client_ref,'client_ref');
    if (value && value.length > 200) throw new InputError('invalid_client_ref');
    if (!String(b.action).startsWith('create_')) throw new InputError('invalid_client_ref');
  }
  if (b.action === 'create_time_entry') {
    if (typeof b.purpose !== 'string' || !b.purpose.trim()) throw new InputError('missing_purpose');
    text(b.purpose,'purpose'); text(b.worker,'worker'); text(b.project,'project'); date(b.date,'date');
    if ((b.hours !== undefined) === (b.flat_rate !== undefined)) throw new InputError('invalid_compensation', 'Supply exactly one of hours or flat_rate.');
    if (b.hours !== undefined) number(b.hours,'hours');
    if (b.flat_rate !== undefined) number(b.flat_rate,'flat_rate');
  }
  if (b.purpose !== undefined) {
    if (typeof b.purpose !== 'string' || !b.purpose.trim()) throw new InputError('missing_purpose');
    text(b.purpose,'purpose');
  }
  for (const field of ['invoice_no','trade']) if (b[field] !== undefined) text(b[field],field,true);
  if (b.date !== undefined) date(b.date,'date');
  if (b.paid_at !== undefined) date(b.paid_at,'paid_at');
  if (b.settlement_method !== undefined) choice(b.settlement_method,'settlement_method',SETTLEMENT_METHODS);
  if (b.stage !== undefined) choice(b.stage,'stage',TASK_STAGES);
  if (b.priority !== undefined) choice(b.priority,'priority',TASK_PRIORITIES);
  if (b.due_date !== undefined && b.due_date !== null) date(b.due_date,'due_date');
  if (b.hours !== undefined) number(b.hours,'hours');
  if (b.flat_rate !== undefined) number(b.flat_rate,'flat_rate');
  if (b.amount !== undefined) number(b.amount,'amount');
  if (b.rate !== undefined) number(b.rate,'rate',true);
  for (const flag of ['is_active','is_manager','is_admin','skip_quickbooks_export','direct_deposit_on_file','info_1099_entered']) if (b[flag] !== undefined && typeof b[flag] !== 'boolean') throw new InputError(`invalid_${flag}`);
}
async function one(db: any, table: string, value: unknown, field: string, name: string, org?: string): Promise<any> {
  const v = text(value,field);
  let q = db.from(table).select('*');
  q = uuid.test(String(v)) ? q.eq('id',v) : q.ilike(name,`%${String(v).replace(/[\\%_]/g,'\\$&')}%`);
  if (org) q=q.eq('org_id',org);
  const {data,error} = await q.limit(10);
  if(error) throw error;
  if(!data?.length) throw new InputError(`invalid_${field}`,`No ${field} matches the supplied value.`,404);
  if(data.length !== 1) throw new InputError(`${field}_ambiguous`,`Use an exact id; multiple ${field} records match.`,409);
  return data[0];
}
async function byId(db:any,table:string,v:unknown,field:string) {
  if(typeof v!=='string'||!uuid.test(v)) throw new InputError(`invalid_${field}`);
  return one(db,table,v,field,'id');
}
async function actor(db:any) {
  const {data,error}=await db.from('profiles').select('id,org_id').eq('is_admin',true).eq('is_active',true).order('created_at').limit(1).maybeSingle();
  if(error) throw error;
  if(!data?.org_id) throw new InputError('no_admin_user','No active administrator with an organization exists.',409);
  return data;
}
async function company(db:any,v:unknown) {
  const s=text(v,'company');
  const {data,error}=await db.from('companies').select('*'); if(error) throw error;
  const rows=(data??[]).filter((c:any)=> c.id===s || c.short_name?.toLowerCase()===s?.toLowerCase() || c.name.toLowerCase()===s?.toLowerCase());
  if(rows.length!==1) throw new InputError('invalid_company','Choose BFP, BFH, FOBAR, or an exact company id.');
  return rows[0];
}
export async function handleNewWrite(db:any,b:Record<string,unknown>):Promise<any> {
  validateNewBody(b);
  const action=String(b.action);
  const a=await actor(db);
  const project=(v:unknown)=>one(db,'projects',v,'project','name',a.org_id);
  const worker=(v:unknown)=>one(db,'profiles',v,'worker','full_name',a.org_id);
  let r:any={};
  const clientRef=b.client_ref===undefined?undefined:text(b.client_ref,'client_ref');
  // A retry resolves the saved record before considering any changed inputs.
  const createTable:Record<string,string>={create_time_entry:'shifts',create_project:'projects',create_vendor:'vendors'};
  if(clientRef&&createTable[action]) {
    const {data,error}=await db.from(createTable[action]).select('*').eq('client_ref',clientRef).maybeSingle();
    if(error) throw error;
    if(data) return b.dry_run?{dry_run:true,would_save:data,saved:false,duplicate:true}:{saved:false,record:data,duplicate:true};
  }
  switch(action) {
    case 'create_time_entry':
    case 'update_time_entry': {
      let existing:any=null;
      if(action==='update_time_entry') {
        existing=await byId(db,'shifts',b.entry_id,'entry');
        await project(existing.project_id); await worker(existing.user_id);
        r.id=existing.id;
      }
      if(b.project!==undefined||!existing) r.project_id=(await project(b.project)).id;
      if(b.worker!==undefined||!existing) r.user_id=(await worker(b.worker)).id;
      if(b.date!==undefined||!existing) r.shift_date=date(b.date,'date');
      for(const f of ['purpose','invoice_no','trade']) if(b[f]!==undefined) r[f]=text(b[f],f,f!=='purpose');
      if(b.hours!==undefined && (b.flat_rate!==undefined||b.amount!==undefined)) throw new InputError('invalid_compensation');
      if(b.flat_rate!==undefined&&b.amount!==undefined) throw new InputError('invalid_compensation');
      if(b.amount!==undefined && !existing?.is_flat_rate) throw new InputError('invalid_amount','Hourly entries use hours and the worker rate; amount is only supported for existing flat-rate entries.');
      if(b.flat_rate!==undefined||b.amount!==undefined) {r.is_flat_rate=true;r.flat_rate_amount=number(b.flat_rate??b.amount,'flat_rate');}
      else if(b.hours!==undefined) {r.is_flat_rate=false;r.total_hours=number(b.hours,'hours');r.start_time=null;r.end_time=null;}
      if(b.allocations!==undefined) {
        if(!Array.isArray(b.allocations)) throw new InputError('invalid_allocations');
        r.allocations=b.allocations.map((x:any)=>{
          if(!x||typeof x!=='object'||typeof x.task_id!=='string'||!uuid.test(x.task_id)) throw new InputError('invalid_allocations');
          return {task_id:x.task_id,hours:number(x.hours,'allocation_hours')};
        });
      }
      if(action==='create_time_entry'&&b.hours!==undefined&&b.allocations===undefined) throw new InputError('allocations_required','Hourly entries require allocations: [{task_id, hours}], totaling hours. No task or times will be invented.');
      if(existing&&Object.keys(r).length===1) throw new InputError('missing_changes');
      break;
    }
    case 'delete_time_entry': {
      const s=await byId(db,'shifts',b.entry_id,'entry');await project(s.project_id);await worker(s.user_id);r.id=s.id;break;
    }
    case 'mark_time_entries_paid': {
      if(!Array.isArray(b.entry_ids)||!b.entry_ids.length||b.entry_ids.length>200||new Set(b.entry_ids).size!==b.entry_ids.length) throw new InputError('invalid_entry_ids');
      for(const id of b.entry_ids) {const s=await byId(db,'shifts',id,'entry');await project(s.project_id);await worker(s.user_id);}
      r={entry_ids:b.entry_ids,paid_at:date(b.paid_at,'paid_at'),settlement_method:choice(b.settlement_method,'settlement_method',SETTLEMENT_METHODS)};
      if(b.reference!==undefined) r.reference=text(b.reference,'reference');break;
    }
    case 'update_bill_status': {
      const bill=await byId(db,'worker_payable_batches',b.bill_id,'bill');await worker(bill.worker_user_id);
      r.id=bill.id;
      if(b.status!==undefined) r.status=choice(b.status,'status',['draft','exported','paid']);
      if(b.qb_bill_doc_number!==undefined) r.qb_bill_doc_number=text(b.qb_bill_doc_number,'qb_bill_doc_number',true);
      if(b.settlement_method!==undefined) r.settlement_method=choice(b.settlement_method,'settlement_method',SETTLEMENT_METHODS);
      if(Object.keys(r).length===1) throw new InputError('missing_changes');break;
    }
    case 'create_project': {
      const name=text(b.name,'name'); const c=await company(db,b.company);
      const {data:matches,error}=await db.from('projects').select('*').eq('org_id',a.org_id).ilike('name',String(name).replace(/[\\%_]/g,'\\$&')); if(error) throw error;
      if(matches?.length>1) throw new InputError('project_ambiguous');
      if(matches?.length===1) {
        if(matches[0].company_id!==c.id) throw new InputError('company_conflict','An existing project has a different company; nothing was created.',409);
        return b.dry_run?{dry_run:true,would_save:matches[0],saved:false,duplicate:true}:{saved:false,record:matches[0],duplicate:true};
      }
      let propertyId=null;
      if(b.property!==undefined) {
        const prop=await one(db,'properties',b.property,'property','display_name');propertyId=prop.id;
      } else {
        const {data,error}=await db.from('properties').select('*').ilike('display_name',String(name).replace(/[\\%_]/g,'\\$&')); if(error) throw error;
        if(data?.length>1) throw new InputError('property_ambiguous');
        if(data?.length===1) propertyId=data[0].id;
      }
      if(propertyId) {
        const {data:linked,error}=await db.from('projects').select('*').eq('property_id',propertyId).eq('org_id',a.org_id); if(error) throw error;
        if(linked?.length>1) throw new InputError('project_ambiguous');
        if(linked?.length) return b.dry_run?{dry_run:true,would_save:linked[0],saved:false,duplicate:true}:{saved:false,record:linked[0],duplicate:true};
        // Canonical ownership is not inferred from names or overwritten.
        const {data:owners,error:ownerErr}=await db.from('property_organization_relationships').select('business_organization_id,relationship_type,effective_to').eq('property_id',propertyId).is('effective_to',null);if(ownerErr) throw ownerErr;
        if(owners?.some((o:any)=>o.relationship_type==='owner'&&o.business_organization_id!==c.business_organization_id)) throw new InputError('company_conflict','Property ownership conflicts with the requested company.',409);
      }
      r={name,company_id:c.id,property_id:propertyId,org_id:a.org_id};break;
    }
    case 'update_project': {
      r.id=(await project(b.project)).id;
      if(b.name!==undefined) r.name=text(b.name,'name');
      if(b.status!==undefined) r.status=choice(b.status,'status',['active','paused','complete']);
      if(Object.keys(r).length===1) throw new InputError('missing_changes');break;
    }
    case 'add_project_member': case 'remove_project_member':r={project_id:(await project(b.project)).id,user_id:(await worker(b.worker)).id};break;
    case 'create_worker': throw new InputError('worker_onboarding_required','Workers are login-backed accounts. This action cannot safely create a payroll worker without an explicit real-account onboarding flow; no account or record was created.',409);
    case 'update_worker': {
      const w=await worker(b.worker);r.id=w.id;
      if(b.email!==undefined||b.phone!==undefined) throw new InputError('unsupported_contact_update','Login email and canonical Person contacts need a separate verified contact workflow. Nothing was changed.',409);
      const fields:Record<string,string>={name:'full_name',rate:'hourly_rate',is_active:'is_active',is_manager:'can_manage_projects',is_admin:'is_admin',skip_quickbooks_export:'skip_qb_export',direct_deposit_on_file:'dd_on_file',info_1099_entered:'tax_info_filed'};
      for(const [f,col] of Object.entries(fields)) if(b[f]!==undefined) r[col]=f==='name'?text(b[f],f):b[f];
      if(Object.keys(r).length===1) throw new InputError('missing_changes');break;
    }
    case 'update_task':case 'complete_task':case 'delete_task': {
      let task:any;
      if(b.task_id!==undefined) task=await byId(db,'tasks',b.task_id,'task');
      else if(action==='update_task') {
        const p=await project(b.project);const title=text(b.match_title,'match_title');
        const {data,error}=await db.from('tasks').select('*').eq('project_id',p.id).eq('task',title);if(error) throw error;
        if(data?.length!==1) throw new InputError(data?.length?'task_ambiguous':'task_not_found'); task=data[0];
      } else throw new InputError('invalid_task');
      await project(task.project_id);r.id=task.id;
      if(action==='update_task') {
        for(const f of ['stage','priority','due_date','trade']) if(b[f]!==undefined) r[f]=b[f];
        if(b.title!==undefined) r.task=text(b.title,'title');
        if(b.worker!==undefined) {
          if(task.assignment_mode==='crew'||task.is_outside_vendor) throw new InputError('assignment_mode_conflict','Crew/outside-vendor tasks require their dedicated assignment workflow.',409);
          r.assigned_to_user_id=b.worker===null?null:(await worker(b.worker)).id;
        }
        if(Object.keys(r).length===1) throw new InputError('missing_changes');
      }
      break;
    }
    case 'create_vendor':r={name:text(b.name,'name'),company_id:(await company(db,b.company)).id};break;
    case 'update_vendor': {
      const v=await one(db,'vendors',b.vendor,'vendor','name');r.id=v.id;
      if(b.name!==undefined) r.name=text(b.name,'name');
      if(b.quickbooks_vendor_name!==undefined && b.quickbooks_vendor_id===undefined) throw new InputError('missing_vendor_id','A QuickBooks name alone cannot link a vendor.');
      if(b.quickbooks_vendor_id!==undefined) {
        if(b.quickbooks_vendor_id===null) {r.quickbooks_vendor_id=null;r.quickbooks_display_name=null;}
        else {
          const id=text(b.quickbooks_vendor_id,'quickbooks_vendor_id');const {conn,error}=await getConnectionForCompany(db,v.company_id);
          if(!conn) throw new InputError('quickbooks_not_connected',error??'QuickBooks connection unavailable.',409);
          const check=await checkQBRef(conn,'Vendor',String(id));
          if(!check.ok) throw new InputError(check.apiError?'quickbooks_unreachable':check.inactive?'vendor_inactive':'vendor_not_found', 'Vendor id could not be verified in this company.',check.apiError?502:409);
          r.quickbooks_vendor_id=id;r.quickbooks_display_name=check.name??null;
          if(b.quickbooks_vendor_name!==undefined&&b.quickbooks_vendor_name!==r.quickbooks_display_name) throw new InputError('vendor_name_mismatch','The supplied name does not match the live QuickBooks vendor.');
        }
      }
      if(Object.keys(r).length===1) throw new InputError('missing_changes');break;
    }
    default:throw new InputError('unsupported_action');
  }
  if(clientRef) r.client_ref=clientRef;
  const {data,error}=await db.rpc('agent_dashboard_write',{p_action:action,p_record:r,p_actor:a.id,p_dry_run:b.dry_run===true});
  if(error) {
    const code=String(error.message);
    if(/^[a-z][a-z_]+$/.test(code)) throw new InputError(code,code,code==='entry_locked'?409:400);
    if(error.code==='23505') throw new InputError('duplicate_conflict','A linked identity already exists; use its exact id.',409);
    throw error;
  }
  return data;
}

export async function getWorkers(db:any,filter:string|null) {
  let q=db.from('profiles').select('*').order('full_name');
  if(filter) q=uuid.test(filter)?q.eq('id',filter):q.ilike('full_name',`%${filter.replace(/[\\%_]/g,'\\$&')}%`);
  const {data,error}=await q;if(error) throw error;
  const workers=(data??[]).map((w:any)=>({id:w.id,name:w.full_name,rate:w.hourly_rate,is_active:w.is_active,is_manager:w.can_manage_projects,is_admin:w.is_admin,skip_quickbooks_export:w.skip_qb_export,direct_deposit_on_file:w.dd_on_file,info_1099_entered:w.tax_info_filed,person_id:w.person_id,org_id:w.org_id}));
  return {count:workers.length,workers};
}
export async function getVendors(db:any,filter:string|null,companyFilter:string|null) {
  let q=db.from('vendors').select('*, companies(name,short_name)').order('name');
  if(filter) q=uuid.test(filter)?q.eq('id',filter):q.ilike('name',`%${filter.replace(/[\\%_]/g,'\\$&')}%`);
  if(companyFilter) q=q.eq('company_id',(await company(db,companyFilter)).id);
  const {data,error}=await q;if(error) throw error;
  return {count:data?.length??0,vendors:(data??[]).map((v:any)=>({...v,company:v.companies?.short_name??v.companies?.name,quickbooks_vendor_name:v.quickbooks_display_name,linked:!!v.quickbooks_vendor_id}))};
}
