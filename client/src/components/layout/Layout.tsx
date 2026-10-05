import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { referentielService } from '../../services/referentiel.service';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';

export default function Layout() {
  const setAnneesDisponibles = useFiltersStore(s => s.setAnneesDisponibles);
  const bu = useFiltersStore(s => s.bu);
  const setBu = useFiltersStore(s => s.setBu);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    referentielService.getAnneesDisponibles()
      .then(setAnneesDisponibles)
      .catch(() => {});
  }, [setAnneesDisponibles]);

  // Un VIEWER est verrouillé sur sa/ses BU : si le filtre global pointe hors périmètre, on le recale.
  useEffect(() => {
    if (user?.role === 'VIEWER' && user.buAccess?.length && !user.buAccess.includes(bu)) {
      setBu(user.buAccess[0]);
    }
  }, [user, bu, setBu]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
