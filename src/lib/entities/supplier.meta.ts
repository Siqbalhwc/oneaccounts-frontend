import type { EntityConfig } from './types';

const COUNTRY_CODES = [
  { value: "+92", label: "🇵🇰 +92" },
  { value: "+1",  label: "🇺🇸 +1" },
  { value: "+44", label: "🇬🇧 +44" },
  { value: "+971",label: "🇦🇪 +971" },
  { value: "+966",label: "🇸🇦 +966" },
  { value: "+91", label: "🇮🇳 +91" },
  { value: "+86", label: "🇨🇳 +86" },
  { value: "+81", label: "🇯🇵 +81" },
  { value: "+49", label: "🇩🇪 +49" },
  { value: "+33", label: "🇫🇷 +33" },
  { value: "+61", label: "🇦🇺 +61" },
  { value: "+27", label: "🇿🇦 +27" },
];

const PHONE_LENGTHS: Record<string, number> = {
  "+92": 10, "+1": 10, "+44": 10, "+971": 9,
  "+966": 9, "+91": 10, "+86": 11, "+81": 10,
  "+49": 10, "+33": 9, "+61": 9, "+27": 9,
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
          if (digits.length !== expectedLen) {
            return `Must be exactly ${expectedLen} digits for ${country}. Currently ${digits.length} digits.`;
          }
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
  // Display balance in search results
  searchResultExtra: (record) => {
    if (record.balance !== undefined) {
      return `Bal: PKR ${(record.balance || 0).toLocaleString()}`;
    }
    return null;
  },
};