import { customerMeta } from './customer.meta';
import { supplierMeta } from './supplier.meta';
import { productMeta  } from './product.meta';
import { locationMeta } from './location.meta';
import { activityMeta } from './activity.meta';
import { projectMeta  } from './project.meta';
import { accountMeta  } from './account.meta';
import type { EntityConfig } from './types';

const registry: Record<string, EntityConfig> = {
  customer: customerMeta,
  supplier: supplierMeta,
  product:  productMeta,
  location: locationMeta,
  activity: activityMeta,
  project:  projectMeta,
  account:  accountMeta,
};

export function getEntityConfig(entity: string): EntityConfig | undefined {
  return registry[entity];
}