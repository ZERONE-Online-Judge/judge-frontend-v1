export function isDedicatedPresentationPath(pathname: string) {
  return /^\/presentation\/(?:login|contests\/[^/]+)\/*$/i.test(pathname);
}
