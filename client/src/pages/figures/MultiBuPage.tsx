import { useFiltersStore } from '../../stores/filters.store';
import MultiBuSynthesisTable from '../../components/pl/MultiBuSynthesisTable';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function MultiBuPage() {
  const { annee, mois, moisMin } = useFiltersStore();

  return (
    <MultiBuSynthesisTable
      annee={annee}
      mois={mois}
      moisMin={moisMin}
      showAnalysis
      title="Multi-BU Consolidated View"
      subtitle={`YTD ${MONTHS_EN[mois - 1]} ${annee} - All BUs`}
    />
  );
}
