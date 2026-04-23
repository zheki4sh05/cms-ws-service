import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsGateway } from './ws.gateway';

@Module({
  imports: [AuthModule],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}
