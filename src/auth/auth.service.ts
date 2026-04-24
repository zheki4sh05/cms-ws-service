import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLIENT_TYPES, ClientType } from '../common/types/domain.types';
import { AuthUser } from './types/auth-user.type';
import { Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly configService: ConfigService) {}

  async validateAccessToken(accessToken: string): Promise<AuthUser> {
    const authUrl = this.configService.get<string>('AUTH_SERVICE_VALIDATE_URL');
    if (!authUrl) {
      throw new UnauthorizedException('Auth service URL is not configured');
    }

    const validationUrl = new URL(authUrl);
    validationUrl.searchParams.set('token', accessToken);
    const maskedToken = this.maskToken(accessToken);
    this.logger.log(
      `validateAccessToken request: method=GET url=${authUrl} params={ token: ${maskedToken} }`,
    );

    let response: Response;
    try {
      response = await fetch(validationUrl, {
        method: 'GET',
      });
      this.logger.log(
        `validateAccessToken response: status=${response.status} ok=${response.ok}`,
      );
    } catch {
      this.logger.error(
        `validateAccessToken network error: url=${authUrl} params={ token: ${maskedToken} }`,
      );
      throw new UnauthorizedException('Auth service is unavailable');
    }

    if (!response.ok) {
      this.logger.warn(
        `validateAccessToken failed: status=${response.status} params={ token: ${maskedToken} }`,
      );
      throw new UnauthorizedException('Token validation failed');
    }

    let isValid = false;
    try {
      const raw = await response.text();
      isValid = raw.trim() === 'true';
      this.logger.log(
        `validateAccessToken completed: success=${isValid} rawResponse=${raw.trim()}`,
      );
    } catch {
      this.logger.error(
        `validateAccessToken parse error: params={ token: ${maskedToken} }`,
      );
      throw new UnauthorizedException('Auth service response is invalid');
    }

    if (!isValid) {
      this.logger.warn(
        `validateAccessToken rejected token: params={ token: ${maskedToken} }`,
      );
      throw new UnauthorizedException('Token is invalid');
    }

    const jwtPayload = this.extractJwtPayload(accessToken);
    const userId = this.extractString(jwtPayload, ['userId', 'sub']);
    if (!userId) {
      throw new UnauthorizedException('Token payload has no userId');
    }

    const clientTypeRaw = this.extractString(jwtPayload, ['clientType']);
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

    return undefined;
  }

  private asClientType(value?: string): ClientType | undefined {
    if (!value) {
      return undefined;
    }

    return CLIENT_TYPES.find((clientType) => clientType === value);
  }

  private extractJwtPayload(accessToken: string): Record<string, unknown> {
    const tokenParts = accessToken.split('.');
    if (tokenParts.length < 2) {
      throw new UnauthorizedException('Access token has invalid JWT format');
    }

    const encodedPayload = tokenParts[1];
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalizedPayload.length % 4)) % 4;
    const paddedPayload = normalizedPayload + '='.repeat(paddingLength);

    try {
      const decoded = Buffer.from(paddedPayload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JWT payload is not an object');
      }

      return parsed as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Failed to decode JWT payload');
    }
  }

  private maskToken(token: string): string {
    if (token.length <= 10) {
      return '***';
    }

    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }
}
