import type { EntityConfig } from './types';

export const activityMeta: EntityConfig = {
  entity: 'activity',
  displayName: 'Activity',
  apiBase: '/api/activities',
  searchFields: ['name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Activity Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text', required: false },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit: ['admin', 'accountant'],
  },
};