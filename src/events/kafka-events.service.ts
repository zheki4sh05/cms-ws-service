import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import {
  CLIENT_TYPES,
  MODULE_TYPES,
  ClientType,
  ModuleType,
} from '../common/types/domain.types';
import { CountersService } from '../counters/counters.service';
import { WsGateway } from '../ws/ws.gateway';
import { WsEventMessage } from './types/ws-event-message.type';

@Injectable()
export class KafkaEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventsService.name);
  private consumer: Consumer | null = null;
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    private readonly configService: ConfigService,
    private readonly countersService: CountersService,
    private readonly wsGateway: WsGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokersRaw = this.configService.get<string>('KAFKA_BROKERS');
    if (!brokersRaw) {
      this.logger.warn('KAFKA_BROKERS is not configured. Kafka consumer is disabled.');
      return;
    }

    const brokers = brokersRaw
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      this.logger.warn('Kafka brokers list is empty. Kafka consumer is disabled.');
      return;
    }

    const topic = this.configService.get<string>('KAFKA_TOPIC_WS_EVENTS') ?? 'ws_events';
    const clientId =
      this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'cms-ws-service';
    const groupId =
      this.configService.get<string>('KAFKA_GROUP_ID') ?? 'cms-ws-service-group';

    const kafka = new Kafka({
      clientId,
      brokers,
    });

    this.consumer = kafka.consumer({ groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const raw = message.value?.toString();
        if (!raw) {
          return;
        }

        await this.handleRawMessage(raw);
      },
    });

    this.logger.log(`Kafka consumer is listening topic "${topic}"`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    await this.consumer.disconnect();
    this.consumer = null;
  }

  private async handleRawMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Skipped invalid JSON message: ${raw}`);
      return;
    }

    if (!this.isWsEventMessage(parsed)) {
      this.logger.warn(`Skipped unsupported payload: ${raw}`);
      return;
    }

    const targetUsers =
      parsed.users && parsed.users.length > 0
        ? parsed.users
        : parsed.userId
          ? [parsed.userId]
          : [];

    if (targetUsers.length === 0) {
      this.logger.warn('Skipped ws_events message without target users');
      return;
    }

    this.logger.debug(
      `Processing ws_events message valueType=${parsed.valueType}, users=${targetUsers.length}, moduleType=${parsed.moduleType}, clientType=${parsed.clientType}`,
    );

    if (parsed.valueType === 'text') {
      const { entityId } = parsed;
      if (!entityId) {
        this.logger.warn('Skipped text ws_events message without entityId');
        return;
      }
      this.wsGateway.emitTextUpdate(
        targetUsers,
        parsed.clientType,
        parsed.companyId,
        entityId,
        parsed.moduleType,
        parsed.data ?? {},
      );
      this.logger.log(
        `Handled text ws event for ${targetUsers.length} user(s) without DB update`,
      );
      return;
    }

    const updatedCounters = await this.countersService.incrementCountersByEvent(
      targetUsers,
      parsed.moduleType,
      parsed.clientType,
      parsed.companyId,
      parsed.data,
    );

    this.wsGateway.emitCounterUpdate(updatedCounters);
    this.logger.log(
      `Handled counter ws event and updated ${updatedCounters.length} counter row(s)`,
    );
  }

  private isWsEventMessage(payload: unknown): payload is WsEventMessage {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const message = payload as Record<string, unknown>;
    const moduleType = message.moduleType;
    const clientType = message.clientType;
    const users = message.users;
    const userId = message.userId;
    const companyId = message.companyId;
    const valueType = message.valueType;
    const entityId = message.entityId;
    const data = message.data;

    if (
      typeof moduleType !== 'string' ||
      !MODULE_TYPES.includes(moduleType as ModuleType)
    ) {
      return false;
    }

    if (
      typeof clientType !== 'string' ||
      !CLIENT_TYPES.includes(clientType as ClientType)
    ) {
      return false;
    }

    if (valueType !== 'counter' && valueType !== 'text') {
      return false;
    }

    if (users !== undefined) {
      if (
        !Array.isArray(users) ||
        users.some((item) => typeof item !== 'string' || item.length === 0)
      ) {
        return false;
      }
    }

    if (userId !== undefined && (typeof userId !== 'string' || userId.length === 0)) {
      return false;
    }

    if (
      typeof companyId !== 'string' ||
      !KafkaEventsService.UUID_V4_REGEX.test(companyId)
    ) {
      return false;
    }

    if (
      data !== undefined &&
      (!data || typeof data !== 'object' || Array.isArray(data))
    ) {
      return false;
    }

    if (valueType === 'text' && data === undefined) {
      return false;
    }

    if (
      valueType === 'text' &&
      (typeof entityId !== 'string' || entityId.length === 0)
    ) {
      return false;
    }

    return true;
  }
}
