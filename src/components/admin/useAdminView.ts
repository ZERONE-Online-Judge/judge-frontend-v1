import { useSearchParams } from 'react-router-dom';

/** Keep work tabs shareable and restore the selected view with browser history. */
export default function useAdminView<T extends string>(
  values: readonly T[],
  fallback: T,
) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const current = values.find((value) => value === requested) ?? fallback;
  function change(value: T) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete('view');
    else next.set('view', value);
    setParams(next);
  }
  return [current, change] as const;
}
