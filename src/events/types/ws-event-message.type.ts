import { ClientType, ModuleType } from '../../common/types/domain.types';

export type WsEventMessage = {
  userId?: string;
  users?: string[];
  moduleType: ModuleType;
  clientType: ClientType;
};
