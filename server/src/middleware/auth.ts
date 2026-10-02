import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const uid = token ? verifyToken(token) : null;
  if (!uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.userId = uid;
  next();
}
