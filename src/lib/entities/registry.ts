import { customerMeta } from './customer.meta';
import { supplierMeta } from './supplier.meta';
import { productMeta  } from './product.meta';
import type { EntityConfig } from './types';

const registry: Record<string, EntityConfig> = {
  customer: customerMeta,
  supplier: supplierMeta,
  product:  productMeta,
};

export function getEntityConfig(entity: string): EntityConfig | undefined {
  return registry[entity];
}