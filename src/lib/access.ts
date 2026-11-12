export const roles = ['agency_representative', 'finance_officer', 'finance_director', 'system_admin'] as const;
export type Role = typeof roles[number];
export const roleLabels:Record<Role,string>={agency_representative:'Представитель ведомства',finance_officer:'Сотрудник Минфина',finance_director:'Руководитель Минфина',system_admin:'Системный администратор'};
export const permissions = ['cases.read_all','cases.review','finance.approve','treasury.reserve','treasury.execute','treasury.income','reports.approve','docs.manage','users.manage','audit.read','settings.manage'] as const;
export type Permission = typeof permissions[number];
export type Access = { id: string; ic_name: string; title: string; organization_id: string; roles: Role[]; permissions: Permission[]; mfa_required: boolean };
export function allowed(a: Access, permission: Permission) { return a.permissions.includes(permission); }
export function visibleModules(a: Access) {
  return [
    { href: '/app', label: 'Обзор', visible: true },
    { href: '/app/cases', label: 'Заявления', visible: a.roles.some(r => r !== 'system_admin') || allowed(a,'cases.read_all') },
    { href: '/app/treasury', label: 'Казначейство', visible: a.permissions.some(p => p.startsWith('treasury.')) },
    { href: '/app/documents', label: 'Документы', visible: allowed(a,'docs.manage') },
    { href: '/app/reports', label: 'Отчётность', visible: allowed(a,'reports.approve') },
    { href: '/app/admin', label: 'Администрирование', visible: ['users.manage','settings.manage','audit.read'].some(p => a.permissions.includes(p as Permission)) },
  ].filter(m => m.visible && ['/app','/app/cases','/app/admin'].includes(m.href));
}
