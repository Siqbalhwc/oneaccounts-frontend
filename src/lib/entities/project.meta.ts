import type { EntityConfig } from './types';

export const projectMeta: EntityConfig = {
  entity: 'project',
  displayName: 'Project',
  apiBase: '/api/projects', // not used (Supabase direct)
  searchFields: ['name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Project Name', type: 'text', required: true },
      {
        name: 'donor_id',
        label: 'Donor',
        type: 'select',
        required: true,
        lookupTable: 'donors',   // will fetch from donors table
        placeholder: 'Select donor',
      },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
};