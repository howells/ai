import { LANGUAGE_MODEL_CATALOG } from "@howells/ai/models";

export interface ModelRow {
  id: string;
  name: string;
}

/** Model choices derived directly from the package-owned catalogue. */
export const MODEL_ROWS: readonly ModelRow[] = LANGUAGE_MODEL_CATALOG.map(({ id, name }) => ({
  id,
  name,
})).toSorted((left, right) => left.name.localeCompare(right.name));
