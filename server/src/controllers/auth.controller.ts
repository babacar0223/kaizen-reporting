import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email et mot de passe requis' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.actif) {
    res.status(401).json({ message: 'Identifiants invalides' });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: 'Identifiants invalides' });
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: 'LOGIN', details: { email } },
  });
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    buAccess: user.buAccess,
    entitesAccess: user.entitesAccess,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as unknown as number,
  });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      buAccess: user.buAccess,
      entitesAccess: user.entitesAccess,
    },
  });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, lastLoginAt: true },
  });
  res.json(user);
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable' }); return; }
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) { res.status(400).json({ message: 'Mot de passe actuel incorrect' }); return; }
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  res.json({ message: 'Mot de passe mis à jour' });
}
