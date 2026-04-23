import { Request } from 'express';
import { AuthUser } from '../types/auth-user.type';

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
