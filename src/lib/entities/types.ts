export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string | number;
  countryCodeField?: string; // when type is 'tel', the field that stores the country code
}

export interface EntityConfig {
  entity: string;
  displayName: string;
  apiBase: string;
  searchFields: string[];
  quickCreate: {
    enabled: boolean;
    fields: FieldConfig[];
  };
  permissions: {
    create: string[];
    edit: string[];
  };
}