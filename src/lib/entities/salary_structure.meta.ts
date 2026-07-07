import type { EntityConfig } from './types';

export const salaryStructureMeta: EntityConfig = {
  entity: 'salary_structure',
  softDelete: false,
  displayName: 'Salary Structure',
  apiBase: '/api/payroll/salary-structures',
  searchFields: ['name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Structure Name', type: 'text', required: true },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit: ['admin', 'accountant'],
  },
};
