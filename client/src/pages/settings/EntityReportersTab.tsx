import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { userService } from '../../services/user.service';
import type { DimEntite, User } from '../../types';
import { UserPlus, RefreshCw, UserX, UserCheck, Copy, Check, X } from 'lucide-react';

function toReporterEmail(nomCourt: string): string {
  const slug = nomCourt.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `reporting@${slug}.com`;
}

function generatePassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$';
  const pool = upper + lower + digits + special;
  const rand = () => pool[Math.floor(Math.random() * pool.length)];
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  return [...required, ...Array.from({ length: 8 }, rand)]
    .sort(() => Math.random() - 0.5)
    .join('');
}

interface Creds { email: string; password: string; entity: string }

type UserWithActif = User & { actif: boolean; createdAt: string };

function findReporter(users: UserWithActif[], entiteId: number): UserWithActif | undefined {
  return users.find(u => u.role === 'VIEWER' && u.entitesAccess.includes(entiteId));
}

const BU_STYLE: Record<string, { header: string; badge: string }> = {
  PROC: { header: 'bg-blue-700', badge: 'bg-blue-100 text-blue-800' },
  FF:   { header: 'bg-purple-700', badge: 'bg-purple-100 text-purple-800' },
  LOG:  { header: 'bg-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="ml-1.5 p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CredentialsModal({ creds, onClose }: { creds: Creds; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-[#1B3A6B] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Credentials Ready</h2>
            <p className="text-blue-200 text-xs mt-0.5">{creds.entity}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            Save these credentials now — the password will not be shown again.
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
            <div className="mt-1 flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-sm font-mono text-gray-800 flex-1">{creds.email}</span>
              <CopyButton text={creds.email} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Password</label>
            <div className="mt-1 flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-sm font-mono text-gray-800 flex-1 tracking-wider">{creds.password}</span>
              <CopyButton text={creds.password} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full mt-2 bg-[#1B3A6B] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#1B3A6B]/90 transition-colors"
          >
            I have saved these credentials
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityCard({ entite, reporter, onAction }: {
  entite: DimEntite;
  reporter?: UserWithActif;
  onAction: (type: 'create' | 'reset' | 'toggle', entite: DimEntite, reporter?: UserWithActif) => void;
}) {
  const email = reporter?.email ?? toReporterEmail(entite.nomCourt);
  const isActive = reporter?.actif === true;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-gray-900 text-sm">{entite.nomCourt}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]" title={entite.nom}>{entite.nom}</p>
          </div>
          {reporter ? (
            isActive ? (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Active
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Disabled
              </span>
            )
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              Not created
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Reporter account</p>
          <p className="text-xs font-mono text-gray-700 bg-gray-50 rounded px-2 py-1 truncate">{email}</p>
        </div>
        {reporter?.lastLoginAt && (
          <p className="text-xs text-gray-400">
            Last login: {new Date(reporter.lastLoginAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {!reporter ? (
            <button
              onClick={() => onAction('create', entite)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Create Account
            </button>
          ) : (
            <>
              <button
                onClick={() => onAction('reset', entite, reporter)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Pwd
              </button>
              <button
                onClick={() => onAction('toggle', entite, reporter)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-red-50 hover:bg-red-100 text-red-700'
                    : 'bg-green-50 hover:bg-green-100 text-green-700'
                }`}
              >
                {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                {isActive ? 'Disable' : 'Enable'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EntityReportersTab() {
  const qc = useQueryClient();
  const [creds, setCreds] = useState<Creds | null>(null);
  const [loadingKey, setLoadingKey] = useState<number | null>(null);

  const { data: bus = [] } = useQuery({ queryKey: ['bus-all'], queryFn: referentielService.getBu });
  const { data: entites = [] } = useQuery({ queryKey: ['entites-all'], queryFn: () => referentielService.getEntites() });
  const { data: users = [] } = useQuery({ queryKey: ['users-all'], queryFn: userService.getAll });

  const createMutation = useMutation({
    mutationFn: userService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => userService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });

  const entitesByBu: Record<number, DimEntite[]> = {};
  for (const e of entites) {
    if (!entitesByBu[e.buId]) entitesByBu[e.buId] = [];
    entitesByBu[e.buId].push(e);
  }

  const handleAction = async (type: 'create' | 'reset' | 'toggle', entite: DimEntite, reporter?: UserWithActif) => {
    setLoadingKey(entite.id);
    try {
      if (type === 'create') {
        const email = toReporterEmail(entite.nomCourt);
        const password = generatePassword();
        await createMutation.mutateAsync({
          email,
          password,
          nom: entite.nomCourt,
          prenom: 'Reporter',
          role: 'VIEWER',
          buAccess: [entite.bu?.nomCourt ?? ''],
          entitesAccess: [entite.id],
        });
        setCreds({ email, password, entity: entite.nom });
      } else if (type === 'reset' && reporter) {
        const password = generatePassword();
        await updateMutation.mutateAsync({ id: reporter.id, data: { password } });
        setCreds({ email: reporter.email, password, entity: entite.nom });
      } else if (type === 'toggle' && reporter) {
        await updateMutation.mutateAsync({ id: reporter.id, data: { actif: !reporter.actif } });
      }
    } finally {
      setLoadingKey(null);
    }
  };

  const activeCount = users.filter(u => u.role === 'VIEWER' && u.actif).length;
  const totalEntites = entites.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{totalEntites}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Entities</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Reporters</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-400">{totalEntites - activeCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pending Setup</p>
        </div>
      </div>

      {bus.map(bu => {
        const buEntites = (entitesByBu[bu.id] ?? []).filter(e => e.actif);
        if (buEntites.length === 0) return null;
        const style = BU_STYLE[bu.nomCourt] ?? { header: 'bg-gray-700', badge: 'bg-gray-100 text-gray-700' };
        return (
          <div key={bu.id} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <div className={`${style.header} px-5 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <h2 className="text-white font-bold text-sm">{bu.nom}</h2>
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{bu.nomCourt}</span>
              </div>
              <span className="text-white/70 text-xs">
                {buEntites.filter(e => findReporter(users, e.id)?.actif).length} / {buEntites.length} active reporters
              </span>
            </div>
            <div className="bg-gray-50 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {buEntites.map(entite => {
                  const reporter = findReporter(users, entite.id);
                  const isLoading = loadingKey === entite.id;
                  return (
                    <div key={entite.id} className={isLoading ? 'opacity-60 pointer-events-none' : ''}>
                      <EntityCard entite={entite} reporter={reporter} onAction={handleAction} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}
