import type { EntityConfig } from './types';

export const activityMeta: EntityConfig = {
  entity: 'activity',
  displayName: 'Activity',
  apiBase: '/api/activities', // not used
  searchFields: ['name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Activity Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text', required: false },
      {
        name: 'project_id',
        label: 'Project',
        type: 'select',
        required: true,
        lookupTable: 'projects',  // fetch projects (ensure only those with donors?)
      },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
};