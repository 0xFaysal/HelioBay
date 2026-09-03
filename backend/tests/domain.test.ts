import { describe, expect, it, vi } from 'vitest';
import { nearestQuery } from '../src/modules/stations/validation.js';
import { StationRepository } from '../src/modules/stations/repository.js';
import type { Database } from '../src/shared/database/client.js';
import { checkBayAssignment } from '../src/modules/bays/service.js';
import { AdminService } from '../src/modules/admin/service.js';
import { summary } from '../src/modules/audit/service.js';
import { costMinor } from '../src/modules/wallets/units.js';
import { vehiclePatch, profilePatch } from '../src/modules/users/validation.js';
import type { Prisma } from '../src/generated/prisma/client.js';

describe('coordinates', () => {
  it.each([{ lat:'91', lng:'90' },{lat:'23',lng:'181'},{lat:'',lng:'90'},{lat:'abc',lng:'90'},{lat:'23',lng:'90',radiusKm:'-1'},{lat:'23',lng:'90',limit:'101'},{lat:['23','24'],lng:'90'}])('rejects invalid input %j', q => { expect(nearestQuery.safeParse(q).success).toBe(false); });
  it('accepts boundary coordinates', () => { expect(nearestQuery.parse({ lat:'-90',lng:'180' })).toEqual({lat:-90,lng:180,radiusKm:25,limit:20}); });
  it('preserves database distance ordering when hydration order differs', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{id:'near',distanceKm:1},{id:'far',distanceKm:10}]), station: { findMany: vi.fn().mockResolvedValue([{id:'far'},{id:'near'}]) } };
    const result = await new StationRepository(db as unknown as Database).nearest(23,90,25,20);
    expect(result.map(x => x.id)).toEqual(['near','far']); expect(result.map(x => x.distanceKm)).toEqual([1,10]);
  });
});
describe('hierarchy rules', () => {
  it.each([{ stationId:'s2', primary:'d1' }, {stationId:'s1',primary:'d2'}])('rejects mismatched device assignment %j', async ({stationId, primary}) => {
    const tx = { station: {findUniqueOrThrow: vi.fn().mockResolvedValue({primaryDeviceId:primary})}, device: {findUniqueOrThrow:vi.fn().mockResolvedValue({stationId})} };
    await expect(checkBayAssignment(tx as unknown as Prisma.TransactionClient,'s1','d1')).rejects.toMatchObject({status:422});
  });
  it('accepts the primary controller of the same station', async () => {
    const tx = { station: {findUniqueOrThrow: vi.fn().mockResolvedValue({primaryDeviceId:'d1'})}, device: {findUniqueOrThrow:vi.fn().mockResolvedValue({stationId:'s1'})} };
    await expect(checkBayAssignment(tx as unknown as Prisma.TransactionClient,'s1','d1')).resolves.toBeUndefined();
  });
});
describe('admin user management', () => {
  function setup(active = 0) {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), user: { findUniqueOrThrow: vi.fn().mockResolvedValue({id:'u1',status:'ACTIVE'}), update: vi.fn().mockResolvedValue({id:'u1',status:'BLOCKED'}) }, chargingSession: { count:vi.fn().mockResolvedValue(active) }, auditLog: {create:vi.fn().mockResolvedValue({})} };
    const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { tx, service: new AdminService(db as unknown as Database) };
  }
  it('writes status and audit together with request correlation', async () => {
    const {tx,service}=setup(); await service.changeUser('u1',{status:'BLOCKED',reason:'Abuse review'},{actorId:'admin',requestId:'req1'});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({actorId:'admin',requestId:'req1',reason:'Abuse review',before:{id:'u1',status:'ACTIVE'},after:{id:'u1',status:'BLOCKED'}})});
  });
  it('rejects blocking an actively charging owner', async () => { const {tx,service}=setup(1); await expect(service.changeUser('u1',{status:'BLOCKED',reason:'Abuse review'},{actorId:'admin',requestId:'r'})).rejects.toMatchObject({status:409}); expect(tx.user.update).not.toHaveBeenCalled(); expect(tx.auditLog.create).not.toHaveBeenCalled(); });
  it('requires a meaningful reason', () => { const {service}=setup(); expect(() => service.changeUser('u1',{status:'BLOCKED',reason:''},{actorId:'admin',requestId:'r'})).toThrow(); });
  it('rejects self-deactivation', () => { const {service}=setup(); expect(() => service.changeUser('admin',{status:'BLOCKED',reason:'Abuse review'},{actorId:'admin',requestId:'r'})).toThrow('cannot deactivate'); });
  it('never includes secrets or arbitrary profiles in audit summaries', () => { expect(summary({id:'d',credentialRef:'secret://private',token:'secret',email:'private',hardwareMetadata:{password:'secret'},status:'OFFLINE'})).toEqual({id:'d',status:'OFFLINE'}); });
});
it('uses exact integer billing with upward rounding', () => { expect(costMinor(1n,2500n)).toBe(1n); expect(costMinor(1000000n,2500n)).toBe(2500n); expect(costMinor(9007199254740993n,2500n)).toBe(22517998136853n); });
it('profile edits cannot elevate role or change account status', () => { expect(profilePatch.safeParse({role:'ADMIN'}).success).toBe(false); expect(profilePatch.safeParse({status:'ACTIVE'}).success).toBe(false); });
it('patching a vehicle name does not clear its default flag', () => { expect(vehiclePatch.parse({name:'New name'})).toEqual({name:'New name'}); });

it('admin PATCH schemas preserve omitted defaults', async () => {
  const { stationPatch, bayPatch, tariffPatch } = await import('../src/modules/admin/validation.js');
  expect(stationPatch.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  expect(bayPatch.parse({ maxPowerW: 7200 })).toEqual({ maxPowerW: 7200 });
  expect(tariffPatch.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
});

