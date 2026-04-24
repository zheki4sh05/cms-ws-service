import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { CLIENT_TYPES, MODULE_TYPES } from '../../common/types/domain.types';
import type { ClientType, ModuleType } from '../../common/types/domain.types';

export class ResetCounterDto {
  @ApiProperty({
    description: 'User ID to reset counter for.',
    example: 'u-1',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: CLIENT_TYPES,
    description: 'Client type scope.',
  })
  @IsIn(CLIENT_TYPES)
  clientType: ClientType;

  @ApiProperty({
    enum: MODULE_TYPES,
    description: 'Module type scope.',
  })
  @IsIn(MODULE_TYPES)
  moduleType: ModuleType;
}
