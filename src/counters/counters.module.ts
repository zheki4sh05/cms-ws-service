import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Counter } from './entities/counter.entity';
import { CountersController } from './counters.controller';
import { CountersService } from './counters.service';

@Module({
  imports: [TypeOrmModule.forFeature([Counter]), AuthModule],
  controllers: [CountersController],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
