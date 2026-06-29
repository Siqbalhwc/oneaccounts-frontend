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
  /** Supabase table name to fetch options for a dynamic select */
  lookupTable?: string;
}

export interface EntityConfig {
  entity: string;
  softDelete?: boolean;
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
  /** Optional: function to extract extra display info from a record (e.g., balance) */
  searchResultExtra?: (record: any) => string | null;
}