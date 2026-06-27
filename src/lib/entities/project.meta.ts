import type { EntityConfig } from './types';

export const projectMeta: EntityConfig = {
  entity: 'project',
  displayName: 'Project',
  apiBase: '/api/projects',
  searchFields: ['name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Project Name', type: 'text', required: true },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit: ['admin', 'accountant'],
  },
};