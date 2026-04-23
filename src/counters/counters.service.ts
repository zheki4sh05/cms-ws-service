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
        toSave.push(existing);
        continue;
      }

      toSave.push(
        this.countersRepository.create({
          userId,
          clientType,
          moduleType,
          number: 1,
        }),
      );
    }

    await this.countersRepository.save(toSave);

    return this.countersRepository.find({
      where: {
        userId: In(uniqueUserIds),
        moduleType,
        clientType,
      },
      order: {
        userId: 'ASC',
      },
    });
  }
}
