// The people holding a contact in their sheep (#1051): whoever has taken the
// person on, as display names. The tie is stored on the contact as `carers`, a
// list of uids; rendering needs names, so this resolves them against whatever
// uid → name map the caller has loaded.

/** The display names of everyone holding this person in their sheep. Carers
 *  whose uid carries no name in the map are dropped — a carer you cannot name
 *  is not shown. */
export function carerNamesOf(
  carers: string[] | null | undefined,
  nameByUid: Record<string, string | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(carers)) return [];
  const names: string[] = [];
  for (const uid of carers) {
    const name = nameByUid?.[uid]?.trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}