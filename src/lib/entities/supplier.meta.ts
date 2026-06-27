import type { EntityConfig } from './types';

export const supplierMeta: EntityConfig = {
  entity: 'supplier',
  displayName: 'Supplier',
  apiBase: '/api/suppliers',
  searchFields: ['code', 'name', 'phone', 'email'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name',    label: 'Supplier Name', type: 'text',  required: true },
      { name: 'phone',   label: 'Mobile Number', type: 'tel',   required: true, countryCodeField: 'country_code' },
      { name: 'email',   label: 'Email',         type: 'email', required: false },
      { name: 'city',    label: 'City',          type: 'text',  required: false },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
};