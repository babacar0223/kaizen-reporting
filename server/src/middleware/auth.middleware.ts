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

// Un VIEWER ne peut interroger que la/les BU de son périmètre (buAccess).
// buAccess vide ⇒ pas de restriction BU (périmètre défini par l'entité uniquement).
// buAccess peut contenir soit le code long (PROCUREMENT) soit l'abréviation (PROC) selon l'historique de saisie.
const BU_ALIASES: Record<string, string[]> = {
  PROCUREMENT: ['PROCUREMENT', 'PROC'],
  FREIGHT_FORWARDING: ['FREIGHT_FORWARDING', 'FF'],
  LOGISTICS: ['LOGISTICS', 'LOG'],
};

export function authorizeBu(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Non authentifié' });
    return;
  }
  if (req.user.role !== 'VIEWER') {
    next();
    return;
  }
  const bu = String(req.params.bu || req.query.bu || '');
  if (bu && req.user.buAccess.length > 0) {
    const accepted = new Set<string>();
    for (const b of req.user.buAccess) {
      accepted.add(b);
      for (const [long, aliases] of Object.entries(BU_ALIASES)) {
        if (aliases.includes(b)) {
          accepted.add(long);
          aliases.forEach(a => accepted.add(a));
        }
      }
    }
    if (!accepted.has(bu)) {
      res.status(403).json({ message: 'Accès à cette BU refusé' });
      return;
    }
  }
  next();
}

export function authorizeTresorerieEntite(req: AuthRequest, res: Response, next: NextFunction): void {
  const entiteId = parseInt(String(req.params.entiteId || req.query.entiteId || req.body.entiteId || ''));
  if (!req.user) {
    res.status(401).json({ message: 'Non authentifié' });
    return;
  }
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    next();
    return;
  }
  if (entiteId && !req.user.tresorerieEntitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Accès à cette entité refusé' });
    return;
  }
  next();
}
