import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { ClientType, ModuleType } from '../../common/types/domain.types';

@Entity('counters')
@Unique('uq_counters_scope', ['userId', 'clientType', 'moduleType'])
export class Counter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ name: 'client_type', type: 'varchar' })
  clientType: ClientType;

  @Column({ name: 'module_type', type: 'varchar' })
  moduleType: ModuleType;

  @Column({ type: 'int', default: 0 })
  number: number;
}
