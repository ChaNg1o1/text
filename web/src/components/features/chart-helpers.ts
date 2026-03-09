import type { FeatureVector } from "@/lib/types";

export const AUTHOR_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 67%, 55%)",
  "hsl(172, 66%, 50%)",
  "hsl(330, 80%, 60%)",
  "hsl(45, 93%, 47%)",
];

export const MAX_CHART_GROUPS = 12;
export const MAX_GROUP_FILTER_CHIPS = 24;
export const MAX_VIEWER_ITEMS = 40;

export interface AuthorSummary {
  author: string;
  count: number;
}

export function buildAuthorSummaries(
  features: FeatureVector[],
  authorMap: Record<string, string>,
  selectedAuthors: string[],
): AuthorSummary[] {
  const selectedSet = selectedAuthors.length > 0 ? new Set(selectedAuthors) : null;
  const counts = new Map<string, number>();

  for (const fv of features) {
    const author = authorMap[fv.text_id] ?? "unknown";
    if (selectedSet !== null && !selectedSet.has(author)) continue;
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((left, right) => right.count - left.count || left.author.localeCompare(right.author));
}

export function prioritizeAuthors(authors: string[], priorityAuthors: string[]) {
  const prioritySet = new Set(priorityAuthors);
  const prioritized = authors.filter((author) => prioritySet.has(author));
  const rest = authors.filter((author) => !prioritySet.has(author));
  return [...new Set([...prioritized, ...rest])];
}

export function getAuthorColor(index: number) {
  return AUTHOR_COLORS[index % AUTHOR_COLORS.length];
}
