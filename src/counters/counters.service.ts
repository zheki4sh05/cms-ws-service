import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientType, ModuleType } from '../common/types/domain.types';
import { Counter } from './entities/counter.entity';

@Injectable()
export class CountersService {
  constructor(
    @InjectRepository(Counter)
    private readonly countersRepository: Repository<Counter>,
  ) {}

  getInitialCounters(userId: string, clientType: ClientType): Promise<Counter[]> {
    return this.countersRepository.find({
      where: { userId, clientType },
      order: { moduleType: 'ASC' },
    });
  }

  async incrementCountersByEvent(
    userIds: string[],
    moduleType: ModuleType,
    clientType: ClientType,
    companyId: string,
    data?: Record<string, unknown>,
  ): Promise<Counter[]> {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    if (uniqueUserIds.length === 0) {
      return [];
    }

    const existingCounters = await this.countersRepository.find({
      where: {
        userId: In(uniqueUserIds),
        moduleType,
        clientType,
        companyId,
      },
    });

    const existingByUserId = new Map(
      existingCounters.map((counter) => [counter.userId, counter]),
    );

    const toSave: Counter[] = [];
    for (const userId of uniqueUserIds) {
      const existing = existingByUserId.get(userId);
      if (existing) {
        existing.number += 1;
        if (data !== undefined) {
          existing.data = data;
        }
        toSave.push(existing);
        continue;
      }

      toSave.push(
        this.countersRepository.create({
          userId,
          clientType,
          moduleType,
          companyId,
          number: 1,
          data: data ?? null,
        }),
      );
    }

    await this.countersRepository.save(toSave);

    return this.countersRepository.find({
      where: {
        userId: In(uniqueUserIds),
        moduleType,
        clientType,
        companyId,
      },
      order: {
        userId: 'ASC',
      },
    });
  }

  async resetCounterByScope(
    userId: string,
    clientType: ClientType,
    moduleType: ModuleType,
  ): Promise<Counter | null> {
    const counter = await this.countersRepository.findOne({
      where: {
        userId,
        clientType,
        moduleType,
      },
      order: {
        id: 'ASC',
      },
    });

    if (!counter) {
      return null;
    }

    counter.number = 0;
    counter.data = null;
    return this.countersRepository.save(counter);
  }
}
