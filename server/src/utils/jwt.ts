import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export function signToken(userId: string): string {
  return jwt.sign({ uid: userId }, env.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { uid: string };
    return payload.uid;
  } catch {
    return null;
  }
}
