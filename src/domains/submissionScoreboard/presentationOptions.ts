export function presentationUrl(contestId: string, divisionIds: string[]) {
  const query = new URLSearchParams();
  [...new Set(divisionIds)].forEach((id) => query.append('divisionId', id));
  return `/operator/contests/${encodeURIComponent(contestId)}/scoreboard/presentation${query.size ? `?${query}` : ''}`;
}

export function presentationApiQuery(divisionIds?: string[]) {
  const query = new URLSearchParams();
  divisionIds?.forEach((id) => query.append('division_id', id));
  return query.size ? `?${query}` : '';
}

export function storedPresentationDivisions(
  stored: string,
  availableIds: string[],
  activeId: string,
) {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const selected = availableIds.filter((id) => parsed.includes(id));
      if (selected.length) return selected;
    }
  } catch {
    // A missing or obsolete preference starts from the active scoreboard.
  }
  return availableIds.includes(activeId) ? [activeId] : availableIds;
}
