import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CountersModule } from './counters/counters.module';
import { EventsModule } from './events/events.module';
import { WsModule } from './ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
          return {
            type: 'postgres' as const,
            url: databaseUrl,
            autoLoadEntities: true,
            synchronize: configService.get<string>('DB_SYNCHRONIZE') !== 'false',
          };
        }

        return {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST') ?? 'localhost',
          port: Number(configService.get<string>('DB_PORT') ?? 5432),
          username: configService.get<string>('DB_USER') ?? 'postgres',
          password: configService.get<string>('DB_PASSWORD') ?? 'postgres',
          database: configService.get<string>('DB_NAME') ?? 'postgres',
          autoLoadEntities: true,
          synchronize: configService.get<string>('DB_SYNCHRONIZE') !== 'false',
        };
      },
    }),
    AuthModule,
    CountersModule,
    WsModule,
    EventsModule,
  ],
})
export class AppModule {}
