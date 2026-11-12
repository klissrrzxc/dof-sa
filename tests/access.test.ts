import { describe,it,expect } from 'vitest';
import { allowed, visibleModules, type Access } from '../src/lib/access';
const admin:Access={id:'admin',ic_name:'Test Administrator',title:'Administrator',organization_id:'org',roles:['system_admin'],permissions:['users.manage','audit.read','settings.manage'],mfa_required:true};
describe('server navigation and authority',()=>{
  it('administrator has no implicit financial authority',()=>{
    expect(allowed(admin,'finance.approve')).toBe(false);
    expect(allowed(admin,'treasury.execute')).toBe(false);
    expect(visibleModules(admin).map(x=>x.label)).toEqual(['Обзор','Администрирование']);
  });
  it('unfinished modules do not become broken navigation links',()=>{
    const granted={...admin,permissions:[...admin.permissions,'treasury.execute'] as Access['permissions']};
    expect(allowed(granted,'treasury.execute')).toBe(true);
    expect(visibleModules(granted).map(x=>x.label)).not.toContain('Казначейство');
  });
});
