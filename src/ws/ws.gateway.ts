import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CLIENT_TYPES, ClientType } from '../common/types/domain.types';
import { AuthService } from '../auth/auth.service';
import { Counter } from '../counters/entities/counter.entity';

type CounterUpdatePayload = {
  userId: string;
  companyId: string;
  valueType: 'counter';
  clientType: string;
  moduleType: string;
  number: number;
  data?: Record<string, unknown>;
};

type TextUpdatePayload = {
  userId: string;
  companyId: string;
  valueType: 'text';
  clientType: string;
  moduleType: string;
  data: Record<string, unknown>;
};

@WebSocketGateway({
  path: '/ws',
  cors: {
    origin: '*',
  },
  pingInterval: 25_000,
  pingTimeout: 60_000,
})
export class WsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WsGateway.name);
  private readonly socketMetaBySocketId = new Map<
    string,
    { userId: string; clientType: ClientType }
  >();
  private readonly socketIdsByUserScope = new Map<string, Set<string>>();

  @WebSocketServer()
  private server: Server;

  constructor(private readonly authService: AuthService) {}

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException('access_token is required');
      }

      const user = await this.authService.validateAccessToken(token);
      const clientType = this.resolveClientType(client, user.clientType);
      if (!clientType) {
        throw new UnauthorizedException(
          'clientType is required in token payload or handshake query',
        );
      }

      client.data.user = { ...user, clientType };
      client.join(this.getUserRoom(user.userId, clientType));
      client.join(this.getUserWildcardRoom(user.userId));
      this.trackConnection(client.id, user.userId, clientType);
      this.logger.debug(
        `Connected socket for user ${user.userId}. Active sockets: ${this.getActiveConnectionsCount(user.userId, clientType)}`,
      );

      client.emit('connection', {
        connection: 'ok',
        heartbeatIntervalMs: 25_000,
        reconnectBackoffMs: [1_000, 2_000, 5_000, 10_000, 20_000],
      });
    } catch (error) {
      this.logger.warn(
        `WS connection rejected: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      client.emit('connection', {
        connection: 'error',
        message: 'unauthorized',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const disconnectedMeta = this.socketMetaBySocketId.get(client.id);
    if (disconnectedMeta) {
      this.untrackConnection(client.id, disconnectedMeta.userId, disconnectedMeta.clientType);
      this.logger.debug(
        `Disconnected socket for user ${disconnectedMeta.userId}. Active sockets: ${this.getActiveConnectionsCount(disconnectedMeta.userId, disconnectedMeta.clientType)}`,
      );
    }
  }

  emitCounterUpdate(counters: Counter[]): void {
    for (const counter of counters) {
      const payload: CounterUpdatePayload = {
        userId: counter.userId,
        companyId: counter.companyId,
        valueType: 'counter',
        clientType: counter.clientType,
        moduleType: counter.moduleType,
        number: counter.number,
      };
      if (counter.data) {
        payload.data = counter.data;
      }
      this.server
        .to(this.getUserRoom(counter.userId, counter.clientType))
        .emit('counter:update', payload);
    }
  }

  emitTextUpdate(
    userIds: string[],
    clientType: ClientType,
    companyId: string,
    moduleType: string,
    data: Record<string, unknown>,
  ): void {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    for (const userId of uniqueUserIds) {
      const payload: TextUpdatePayload = {
        userId,
        companyId,
        valueType: 'text',
        clientType,
        moduleType,
        data,
      };
      this.server.to(this.getUserRoom(userId, clientType)).emit('text:update', payload);
    }
    this.logger.debug(
      `Emitted text:update for ${uniqueUserIds.length} user(s), clientType=${clientType}, moduleType=${moduleType}`,
    );
  }

  private extractToken(client: Socket): string | null {
    const queryToken = client.handshake.query.access_token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    const authToken = client.handshake.auth.access_token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    return null;
  }

  private resolveClientType(
    client: Socket,
    userClientType?: ClientType,
  ): ClientType | undefined {
    if (userClientType) {
      return userClientType;
    }

    const queryClientType = client.handshake.query.client_type;
    if (typeof queryClientType === 'string') {
      return CLIENT_TYPES.find((clientType) => clientType === queryClientType);
    }

    const authClientType = client.handshake.auth.client_type;
    if (typeof authClientType === 'string') {
      return CLIENT_TYPES.find((clientType) => clientType === authClientType);
    }

    return undefined;
  }

  private getUserRoom(userId: string, clientType: string): string {
    return `user:${userId}:${clientType}`;
  }

  private getUserWildcardRoom(userId: string): string {
    return `user:${userId}`;
  }

  private trackConnection(
    socketId: string,
    userId: string,
    clientType: ClientType,
  ): void {
    this.socketMetaBySocketId.set(socketId, { userId, clientType });
    const scopeKey = this.getScopeKey(userId, clientType);
    const socketIds = this.socketIdsByUserScope.get(scopeKey) ?? new Set<string>();
    socketIds.add(socketId);
    this.socketIdsByUserScope.set(scopeKey, socketIds);
  }

  private untrackConnection(
    socketId: string,
    userId: string,
    clientType: ClientType,
  ): void {
    this.socketMetaBySocketId.delete(socketId);
    const scopeKey = this.getScopeKey(userId, clientType);
    const socketIds = this.socketIdsByUserScope.get(scopeKey);
    if (!socketIds) {
      return;
    }

    socketIds.delete(socketId);
    if (socketIds.size === 0) {
      this.socketIdsByUserScope.delete(scopeKey);
      return;
    }

    this.socketIdsByUserScope.set(scopeKey, socketIds);
  }

  private getActiveConnectionsCount(userId: string, clientType: ClientType): number {
    return this.socketIdsByUserScope.get(this.getScopeKey(userId, clientType))?.size ?? 0;
  }

  private getScopeKey(userId: string, clientType: ClientType): string {
    return `${userId}:${clientType}`;
  }
}
