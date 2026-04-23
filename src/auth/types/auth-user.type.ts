import { ClientType } from '../../common/types/domain.types';

export type AuthUser = {
  userId: string;
  clientType?: ClientType;
};
