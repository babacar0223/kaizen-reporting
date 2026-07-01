import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Role } from '../types';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token manquant' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      res.status(403).json({ message: 'Accès refusé' });
      return;
    }
    next();
  };
}

export function authorizeEntite(req: AuthRequest, res: Response, next: NextFunction): void {
  const entiteId = parseInt(String(req.params.entiteId || req.query.entiteId || ''));
  if (!req.user) {
    res.status(401).json({ message: 'Non authentifié' });
    return;
  }
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    next();
    return;
  }
  if (entiteId && !req.user.entitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Accès à cette entité refusé' });
    return;
  }
  next();
}
