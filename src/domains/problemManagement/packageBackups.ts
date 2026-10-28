import { apiBlobRequest } from '@/shared/api/client';

export async function downloadPackageBackup(path: string, token: string) {
  const blob = await apiBlobRequest(path.replace(/^\/api/, ''), token);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'before-update.zoj.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
