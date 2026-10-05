import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/user.service';
import { referentielService } from '../../services/referentiel.service';
import { tresorerieService } from '../../services/tresorerie.service';
import type { Role, User } from '../../types';
import { UserPlus, UserX, UserCheck, Edit2, X, Shield, Eye, Users } from 'lucide-react';

const ROLE_STYLE: Record<Role, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN:       'bg-orange-100 text-orange-700',
  VIEWER:      'bg-blue-100 text-blue-700',
};

const ROLE_ICON: Record<Role, typeof Shield> = {
  SUPER_ADMIN: Shield,
  ADMIN:       Users,
  VIEWER:      Eye,
};

const ALL_BU = ['PROCUREMENT', 'FREIGHT_FORWARDING', 'LOGISTICS'];
const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none';

interface FormState {
  prenom: string; nom: string; email: string; password: string;
  role: string; buAccess: string[]; entitesAccess: number[]; tresorerieEntitesAccess: number[]; actif: boolean;
}

function toForm(u?: User): FormState {
  return {
    prenom: u?.prenom ?? '', nom: u?.nom ?? '', email: u?.email ?? '', password: '',
    role: u?.role ?? 'VIEWER',
    buAccess: u?.buAccess ?? [],
    entitesAccess: u?.entitesAccess ?? [],
    tresorerieEntitesAccess: u?.tresorerieEntitesAccess ?? [],
    actif: u?.actif ?? true,
  };
}

function UserModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [form, setForm] = useState<FormState>(toForm(user));
  const [error, setError] = useState('');

  const { data: plEntites = [] } = useQuery({ queryKey: ['entites'], queryFn: () => referentielService.getEntites() });
  const { data: tresoEntites = [] } = useQuery({ queryKey: ['tresorerie-entites'], queryFn: tresorerieService.getEntites });

  const toggleId = (key: 'entitesAccess' | 'tresorerieEntitesAccess', id: number) => setForm(f => ({
    ...f, [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id],
  }));

  const mutation = useMutation({
    mutationFn: () => {
      const base = {
        email: form.email.trim(),
        nom: form.nom.trim(), prenom: form.prenom.trim(),
        role: form.role,
        buAccess: form.role === 'SUPER_ADMIN' ? [] : form.buAccess,
        entitesAccess: form.role === 'VIEWER' ? form.entitesAccess : [],
        tresorerieEntitesAccess: form.role === 'VIEWER' ? form.tresorerieEntitesAccess : [],
      };
      if (isEdit) {
        return userService.update(user!.id, {
          ...base,
          actif: form.actif,
          ...(form.password ? { password: form.password } : {}),
        });
      }
      return userService.create({ ...base, password: form.password });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users-all'] }); onClose(); },
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e?.response?.data?.message ?? 'Operation failed'),
  });

  const toggleBu = (bu: string) => setForm(f => ({
    ...f, buAccess: f.buAccess.includes(bu) ? f.buAccess.filter(b => b !== bu) : [...f.buAccess, bu],
  }));

  const submit = () => {
    if (!form.email || !form.nom) { setError('Email and last name are required'); return; }
    if (!isEdit && !form.password) { setError('Password is required for a new user'); return; }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B3A6B] px-6 py-4 flex items-center justify-between sticky top-0">
          <h2 className="text-white font-bold">{isEdit ? `Edit user — ${user!.prenom} ${user!.nom}` : 'Create new user'}</h2>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First name</label>
              <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} className={inputCls} placeholder="Jean" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last name *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className={inputCls} placeholder="Dupont" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="user@company.com" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Password {isEdit ? '(leave blank to keep unchanged)' : '*'}
            </label>
            <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className={inputCls + ' font-mono'} placeholder={isEdit ? '••••••••' : 'Temporary password'} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
              <option value="VIEWER">VIEWER – Read only (assigned entities)</option>
              <option value="ADMIN">ADMIN – Data entry &amp; imports</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN – Full access</option>
            </select>
          </div>

          {form.role !== 'SUPER_ADMIN' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BU access</label>
              <div className="mt-1 flex gap-2 flex-wrap">
                {ALL_BU.map(bu => (
                  <button key={bu} type="button" onClick={() => toggleBu(bu)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${form.buAccess.includes(bu) ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    {bu.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.role === 'VIEWER' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entities the user can view (P&amp;L)</label>
              <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {plEntites.map(e => (
                  <label key={e.id} className="flex items-center gap-2 text-xs text-gray-700 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="accent-[#1B3A6B]" checked={form.entitesAccess.includes(e.id)} onChange={() => toggleId('entitesAccess', e.id)} />
                    <span>{e.nom}{e.bu ? <span className="text-gray-400"> · {e.bu.nomCourt}</span> : null}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Nothing checked = access to all entities of the selected BUs.</p>
            </div>
          )}

          {form.role === 'VIEWER' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Treasury entities the user can enter</label>
              <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {tresoEntites.map(e => (
                  <label key={e.id} className="flex items-center gap-2 text-xs text-gray-700 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="accent-[#1B3A6B]" checked={form.tresorerieEntitesAccess.includes(e.id)} onChange={() => toggleId('tresorerieEntitesAccess', e.id)} />
                    <span>{e.nom}<span className="text-gray-400"> · {e.pays}</span></span>
                  </label>
                ))}
                {tresoEntites.length === 0 && <p className="text-xs text-gray-400 px-1">No treasury entity configured.</p>}
              </div>
              <p className="text-xs text-gray-400 mt-1">Grants access to the daily treasury entry screen for the checked entities. Nothing checked = no treasury access.</p>
            </div>
          )}

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} className="accent-[#1B3A6B]" />
              Active account
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={submit} disabled={mutation.isPending} className="flex-1 bg-[#1B3A6B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1B3A6B]/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users-all'], queryFn: userService.getAll });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => userService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });
  const disableMutation = useMutation({
    mutationFn: (id: number) => userService.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });

  const activeCount = users.filter(u => u.actif !== false).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{users.length} users total</span>
          <span className="text-sm text-green-600 font-medium">{activeCount} active</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1B3A6B]/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          New user
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading users…</div>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="text-left px-4 py-3 font-semibold">User</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                <th className="text-left px-4 py-3 font-semibold">BU Access</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Last Login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const RoleIcon = ROLE_ICON[user.role as Role] ?? Eye;
                const isActive = user.actif !== false;
                return (
                  <tr key={user.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${!isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#1B3A6B] font-bold text-xs">{(user.prenom?.[0] ?? '') + (user.nom?.[0] ?? '')}</span>
                        </div>
                        <p className="font-semibold text-gray-800">{user.prenom} {user.nom}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_STYLE[user.role as Role] ?? 'bg-gray-100 text-gray-600'}`}>
                        <RoleIcon className="w-2.5 h-2.5" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">
                      {user.buAccess?.length ? user.buAccess.join(', ') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isActive
                        ? <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Disabled</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditUser(user as User)} title="Edit user" className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => isActive ? disableMutation.mutate(user.id) : updateMutation.mutate({ id: user.id, data: { actif: true } })}
                          title={isActive ? 'Disable' : 'Enable'}
                          className={`p-1 rounded transition-colors ${isActive ? 'text-gray-300 hover:text-red-600 hover:bg-red-50' : 'text-gray-300 hover:text-green-600 hover:bg-green-50'}`}
                        >
                          {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <UserModal onClose={() => setShowCreate(false)} />}
      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}
