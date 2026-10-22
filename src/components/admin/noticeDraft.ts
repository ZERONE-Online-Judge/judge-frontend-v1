import type { ServiceNotice } from '@/domains/serviceCommunication/types';
export type PickNotice = Pick<
  ServiceNotice,
  'title' | 'summary' | 'body' | 'emergency'
>;
export const emptyNoticeDraft: PickNotice = {
  title: '',
  summary: '',
  body: '',
  emergency: false,
};
export function loadNoticeDraft(key: string): PickNotice {
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(key) ?? 'null',
    );
    if (
      value &&
      typeof value === 'object' &&
      'title' in value &&
      typeof value.title === 'string' &&
      'summary' in value &&
      typeof value.summary === 'string' &&
      'body' in value &&
      typeof value.body === 'string' &&
      'emergency' in value &&
      typeof value.emergency === 'boolean'
    )
      return value as PickNotice;
  } catch {
    /* Keep the editor usable when browser storage is unavailable. */
  }
  return { ...emptyNoticeDraft };
}
export function hasNoticeDraft(draft: PickNotice) {
  return Boolean(draft.title || draft.summary || draft.body || draft.emergency);
}
