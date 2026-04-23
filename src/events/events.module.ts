import { Module } from '@nestjs/common';
import { CountersModule } from '../counters/counters.module';
import { WsModule } from '../ws/ws.module';
import { KafkaEventsService } from './kafka-events.service';

@Module({
  imports: [CountersModule, WsModule],
  providers: [KafkaEventsService],
})
export class EventsModule {}
