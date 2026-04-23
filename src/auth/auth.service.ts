import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLIENT_TYPES, ClientType } from '../common/types/domain.types';
import { AuthUser } from './types/auth-user.type';

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  async validateAccessToken(accessToken: string): Promise<AuthUser> {
    const authUrl = this.configService.get<string>('AUTH_SERVICE_VALIDATE_URL');
    if (!authUrl) {
      throw new UnauthorizedException('Auth service URL is not configured');
    }

    let response: Response;
    try {
      response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      });
    } catch {
      throw new UnauthorizedException('Auth service is unavailable');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Token validation failed');
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Auth service response is invalid');
    }
    const userId = this.extractString(payload, ['userId', 'sub']);
    if (!userId) {
      throw new UnauthorizedException('Token payload has no userId');
    }

    const clientTypeRaw = this.extractString(payload, ['clientType']);
    const clientType = this.asClientType(clientTypeRaw);

    return {
      userId,
      clientType,
    };
  }

  private extractString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const direct = payload[key];
      if (typeof direct === 'string' && direct.length > 0) {
        return direct;
      }
    }

    const nestedPayload = payload.data;
    if (nestedPayload && typeof nestedPayload === 'object') {
      const nested = nestedPayload as Record<string, unknown>;
      for (const key of keys) {
        const value = nested[key];
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }

    return undefined;
  }

  private asClientType(value?: string): ClientType | undefined {
    if (!value) {
      return undefined;
    }

    return CLIENT_TYPES.find((clientType) => clientType === value);
  }
}
