import resourcesJson from '../../catalog/crisis-resources.json';

/** 心理援助资源（危机资源条数据源）。`verified_at` 记录最近一次人工核对日期。 */
export interface CrisisResource {
  name: string;
  contact: string;
  scope?: string;
  hours?: string;
  note?: string;
}

export interface CrisisResourceData {
  note: string;
  verified_at: string;
  resources: CrisisResource[];
  emergency: CrisisResource;
}

export const CRISIS_RESOURCES = resourcesJson as unknown as CrisisResourceData;
