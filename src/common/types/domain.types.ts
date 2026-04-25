export const CLIENT_TYPES = ['employee', 'admin'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const MODULE_TYPES = [
  'integration',
  'risk_object',
  'integration_status',
  'integration_invocations',
] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];
