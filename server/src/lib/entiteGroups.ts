// Entités "consolidées" : une entité mère qui n'est jamais alimentée directement, dont les
// chiffres sont la somme de ses entités filles. Pas de colonne DB — mapping statique volontairement
// simple, à étendre ici si d'autres entités sont un jour scindées de la même façon.
//
// Afrilog International (id 4) = Local Procurement (22) + International Procurement (23).
export const ENTITE_GROUPS: Record<number, number[]> = {
  4: [22, 23],
};

// Renvoie les ids à interroger pour une entité donnée : ses propres id + celles de ses filles
// si c'est une entité consolidée, sinon juste elle-même.
export function resolveEntiteIds(entiteId: number): number[] {
  const children = ENTITE_GROUPS[entiteId];
  return children ? [entiteId, ...children] : [entiteId];
}

export function isCompositeEntite(entiteId: number): boolean {
  return entiteId in ENTITE_GROUPS;
}

const CHILD_TO_PARENT: Record<number, number> = Object.fromEntries(
  Object.entries(ENTITE_GROUPS).flatMap(([parent, children]) => children.map(c => [c, Number(parent)])),
);

// Clé de regroupement d'une entité : l'id du parent si c'est une entité fille (ex. Local/International
// Procurement → 4), sinon elle-même. Sert à ne compter qu'une fois une valeur "déjà consolidée" (le
// YTD N-1 de 2025, saisi à l'identique dans les 2 fichiers) quand plusieurs entités sont agrégées
// ensemble (BU entière, entité consolidée…), sans empêcher la somme normale entre entités distinctes.
export function groupKeyOf(entiteId: number): number {
  return CHILD_TO_PARENT[entiteId] ?? entiteId;
}
