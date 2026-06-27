import type { EntityConfig } from './types';

const COUNTRY_CODES = [
  { code: '+92', label: '🇵🇰 +92' },
  { code: '+1',  label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971',label: '🇦🇪 +971' },
  { code: '+966',label: '🇸🇦 +966' },
  { code: '+91', label: '🇮🇳 +91' },
];

const PHONE_LENGTHS: Record<string, number> = {
  '+92': 10,
  '+1': 10,
  '+44': 10,
  '+971': 9,
  '+966': 9,
  '+91': 10,
};

export const supplierMeta: EntityConfig = {
  entity: 'supplier',
  displayName: 'Supplier',
  apiBase: '/api/suppliers',
  searchFields: ['code', 'name', 'phone', 'email'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name',    label: 'Supplier Name', type: 'text',  required: true },
      {
        name: 'country_code',
        label: 'Country Code',
        type: 'select',
        required: true,
        defaultValue: '+92',
        options: COUNTRY_CODES,
      },
      {
        name: 'phone',
        label: 'Mobile Number',
        type: 'text',
        required: true,
        placeholder: '300 1234567',
        validation: (value: string, formValues?: Record<string, any>) => {
          if (!value) return 'Mobile number is required';
          const digits = value.replace(/\D/g, '');
          const country = (formValues?.country_code as string) || '+92';
          const expectedLen = PHONE_LENGTHS[country] || 10;
          if (digits.length < expectedLen) return `Enter ${expectedLen} digits for ${country}`;
          return null;
        },
      },
      { name: 'email',   label: 'Email',         type: 'email', required: false },
      { name: 'city',    label: 'City',          type: 'text',  required: false },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
};