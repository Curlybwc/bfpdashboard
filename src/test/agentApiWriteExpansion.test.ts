import { describe, it, expect, vi } from 'vitest';
vi.mock('../../supabase/functions/_shared/quickbooks.ts', () => ({ getConnectionForCompany: vi.fn(), checkQBRef: vi.fn() }));
import { validateNewBody, date, SETTLEMENT_METHODS } from '../../supabase/functions/agent_api/write-expansion';
const base = { action:'create_time_entry', worker:'Andrew', project:'137 Forestwood', date:'2026-10-21', flat_rate:500, purpose:'Replace faucet' };
describe('agent write owner rules', () => {
 it('requires a human-entered payment purpose',()=> {expect(()=>validateNewBody({...base,purpose:undefined})).toThrow('missing_purpose');expect(()=>validateNewBody({...base,purpose:' '})).toThrow('missing_purpose');});
 it('accepts an exact $500 flat-rate entry',()=>expect(()=>validateNewBody(base)).not.toThrow());
 it('rejects simultaneous hours and flat amount',()=>expect(()=>validateNewBody({...base,hours:8})).toThrow('invalid_compensation'));
 it('requires a real dry-run boolean',()=>expect(()=>validateNewBody({...base,dry_run:'true'})).toThrow('invalid_dry_run'));
 it('permits all five outside settlement methods',()=>{expect(SETTLEMENT_METHODS).toEqual(['bill_pay','check','direct_deposit','cash','other']);for(const settlement_method of SETTLEMENT_METHODS) expect(()=>validateNewBody({action:'mark_time_entries_paid',settlement_method})).not.toThrow();});
 it('rejects unsupported settlement methods',()=>expect(()=>validateNewBody({action:'mark_time_entries_paid',settlement_method:'stripe'})).toThrow('invalid_settlement_method'));
 it('allows a zero worker rate without inventing a rate',()=>expect(()=>validateNewBody({action:'update_worker',rate:0})).not.toThrow());
 it('rejects negative rates',()=>expect(()=>validateNewBody({action:'update_worker',rate:-1})).toThrow('invalid_rate'));
 it('rejects impossible calendar dates',()=>expect(()=>date('2026-02-30','date')).toThrow('invalid_date'));
 it('requires nonempty client retry references',()=>expect(()=>validateNewBody({...base,client_ref:''})).toThrow('invalid_client_ref'));
 it('rejects fractional cents in exact amounts',()=>expect(()=>validateNewBody({...base,flat_rate:500.001})).toThrow('invalid_flat_rate'));
});
