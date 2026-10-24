const EDITOR_ORIGIN = 'https://editor.zoj.kr';

export function safeEditorPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/problems';
  if (
    value.includes('\\') ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return '/problems';
  try {
    const url = new URL(value, EDITOR_ORIGIN);
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== EDITOR_ORIGIN ||
      path.includes('\\') ||
      !/^\/(?:problems(?:\/|$)|help(?:\/|$)|$)/.test(path)
    )
      return '/problems';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/problems';
  }
}
export function editorReturnUrl(value: string | null) {
  return EDITOR_ORIGIN + safeEditorPath(value);
}
