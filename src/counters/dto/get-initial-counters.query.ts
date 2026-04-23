import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CLIENT_TYPES } from '../../common/types/domain.types';
import type { ClientType } from '../../common/types/domain.types';

export class GetInitialCountersQuery {
  @ApiPropertyOptional({
    enum: CLIENT_TYPES,
    description: 'Тип клиента. Если не передан, используется clientType из токена.',
  })
  @IsOptional()
  @IsIn(CLIENT_TYPES)
  clientType?: ClientType;
}
