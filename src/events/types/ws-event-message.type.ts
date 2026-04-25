import { ClientType, ModuleType } from '../../common/types/domain.types';

export type WsEventValueType = 'counter' | 'text';

export type WsEventMessage = {
  userId?: string;
  users?: string[];
  companyId: string;
  valueType: WsEventValueType;
  entityId?: string;
  moduleType: ModuleType;
  clientType: ClientType;
  data?: Record<string, unknown>;
};
