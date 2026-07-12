/**
 * Label-mapping layer for company_type-driven UI text.
 *
 * Purpose: the same underlying tables (donor_tags, project_tags,
 * activity_tags, etc.) are reused across company types, but the
 * word shown on screen should change — e.g. "Donor" for an NGO
 * tenant should read "Investor" for a Construction tenant.
 *
 * This is deliberately NOT a database table. Labels are the same
 * for every tenant of a given business_type (not further
 * customizable per-tenant), so a static config avoids an
 * unnecessary extra query on every page load. If you later need
 * per-tenant overrides, this is the file to convert into a DB-backed
 * lookup — the getLabel() call sites below won't need to change.
 *
 * Usage:
 *   import { getLabel } from '@/lib/labels';
 *   const donorLabel = getLabel(company.business_type, 'donor');
 *   // NGO tenant -> "Donor"
 *   // Construction tenant -> "Investor"
 *   // Any other/unknown type -> falls back to the NGO default
 */

export type BusinessType =
  | 'ngo'
  | 'trading'
  | 'service'
  | 'manufacturing'
  | 'construction';

export type LabelKey =
  | 'donor'          // NGO: Donor -> Construction: Investor
  | 'donor_plural'
  | 'project'        // NGO: Project -> Construction: Site
  | 'project_plural'
  | 'activity'        // NGO: Activity -> Construction: Cost Code
  | 'activity_plural'
  | 'location'       // NGO: Location -> Construction: Site Zone
  | 'location_plural';

const DEFAULT_LABELS: Record<LabelKey, string> = {
  donor: 'Donor',
  donor_plural: 'Donors',
  project: 'Project',
  project_plural: 'Projects',
  activity: 'Activity',
  activity_plural: 'Activities',
  location: 'Location',
  location_plural: 'Locations',
};

const OVERRIDES: Partial<Record<BusinessType, Partial<Record<LabelKey, string>>>> = {
  construction: {
    donor: 'Investor',
    donor_plural: 'Investors',
    project: 'Site',
    project_plural: 'Sites',
    activity: 'Cost Code',
    activity_plural: 'Cost Codes',
    location: 'Site Zone',
    location_plural: 'Site Zones',
  },
  // trading / service / manufacturing intentionally use DEFAULT_LABELS
  // for now — add overrides here only if a real need comes up.
};

/**
 * Returns the correct display label for a given business_type.
 * Falls back to the NGO default if business_type is null/unknown,
 * or if this specific key has no override for that type.
 */
export function getLabel(
  businessType: string | null | undefined,
  key: LabelKey
): string {
  const type = businessType as BusinessType;
  return OVERRIDES[type]?.[key] ?? DEFAULT_LABELS[key];
}

/**
 * Convenience: returns the full label set for a business_type,
 * useful when a page needs several labels at once
 * (e.g. a page header + table columns).
 */
export function getLabelSet(
  businessType: string | null | undefined
): Record<LabelKey, string> {
  const type = businessType as BusinessType;
  return { ...DEFAULT_LABELS, ...(OVERRIDES[type] ?? {}) };
}