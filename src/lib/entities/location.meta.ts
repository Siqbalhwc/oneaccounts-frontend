import type { EntityConfig } from './types';

export const locationMeta: EntityConfig = {
  entity: 'location',
  displayName: 'Location',
  apiBase: '/api/locations',
  searchFields: ['name', 'code'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Location Name', type: 'text', required: true },
      { name: 'code', label: 'Code', type: 'text', required: false },
    ],
  },
  permissions: {
    create: ['admin'],
    edit: ['admin'],
  },
};