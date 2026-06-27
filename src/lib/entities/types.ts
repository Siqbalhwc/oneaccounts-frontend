export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string | number;
  countryCodeField?: string;
  validation?: (value: string, formValues?: Record<string, any>) => string | null;
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