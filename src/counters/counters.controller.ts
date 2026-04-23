import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { GetInitialCountersQuery } from './dto/get-initial-counters.query';
import { CountersService } from './counters.service';

@ApiTags('Counters')
@ApiBearerAuth()
@Controller('counters')
@UseGuards(AccessTokenGuard)
export class CountersController {
  constructor(private readonly countersService: CountersService) {}

  @ApiOperation({
    summary: 'Получить начальные счетчики пользователя',
  })
  @ApiQuery({
    name: 'clientType',
    required: false,
    enum: ['employee', 'admin'],
    description:
      'Тип клиента. Если не передан, используется clientType из токена.',
  })
  @ApiOkResponse({
    description: 'Начальные счетчики для userId/clientType',
  })
  @ApiUnauthorizedResponse({
    description: 'Токен отсутствует или невалиден',
  })
  @Get('initial')
  async getInitialCounters(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true }))
    query: GetInitialCountersQuery,
  ) {
    const clientType = query.clientType ?? request.user.clientType;
    if (!clientType) {
      throw new BadRequestException(
        'clientType is required either in query or token payload',
      );
    }

    const counters = await this.countersService.getInitialCounters(
      request.user.userId,
      clientType,
    );

    return {
      userId: request.user.userId,
      clientType,
      counters: counters.map((counter) => ({
        moduleType: counter.moduleType,
        number: counter.number,
      })),
    };
  }
}
