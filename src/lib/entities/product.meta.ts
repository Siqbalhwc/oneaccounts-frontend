import type { EntityConfig } from './types';

export const productMeta: EntityConfig = {
  entity: 'product',
  displayName: 'Product',
  apiBase: '/api/products',
  searchFields: ['code', 'name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name',       label: 'Product Name', type: 'text',   required: true },
      { name: 'sale_price', label: 'Sale Price',   type: 'number', required: false, defaultValue: 0 },
      { name: 'cost_price', label: 'Cost Price',   type: 'number', required: false, defaultValue: 0 },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
  // Display stock in search results
  searchResultExtra: (record) => {
    if (record.qty_on_hand !== undefined) {
      return `Stock: ${record.qty_on_hand}`;
    }
    return null;
  },
};