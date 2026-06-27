import type { EntityConfig } from './types';

const ACCOUNT_TYPES = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Liability', label: 'Liability' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Revenue', label: 'Revenue' },
  { value: 'Expense', label: 'Expense' },
];

export const accountMeta: EntityConfig = {
  entity: 'account',
  displayName: 'GL Account',
  apiBase: '/api/accounts',
  searchFields: ['code', 'name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name', label: 'Account Name', type: 'text', required: true },
      { name: 'code', label: 'Code', type: 'text', required: false },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: ACCOUNT_TYPES,
      },
    ],
  },
  permissions: {
    create: ['admin'],
    edit: ['admin'],
  },
};