import {
  PACKAGE_FILE_ROLES,
  type PackageFileRole,
  type PackageSupportFileStatus,
  type ProblemAsset,
} from './types';

function supportFilename(name: string) {
  return name.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
}

export function supportRoleFromAsset(
  asset: ProblemAsset,
): PackageFileRole | null {
  const filename = supportFilename(asset.original_filename);
  const storageRole = asset.storage_key.match(
    /\/(?:support|package-files)\/([^/]+)(?:\/|$)/,
  )?.[1];
  // Package resources also include statements, licenses and project snapshots.
  // Only the actual testlib.h file represents the required header row.
  if (storageRole === 'package-resource')
    return filename === 'testlib.h' ? 'package-resource' : null;
  if (PACKAGE_FILE_ROLES.some((role) => role.value === storageRole))
    return storageRole as PackageFileRole;
  if (filename === 'testlib.h') return 'package-resource';
  if (filename === 'validator.cpp') return 'validator';
  if (filename === 'checker.cpp') return 'checker';
  return null;
}

export function testcaseSupportAssets(assets: ProblemAsset[]) {
  const grouped = new Map<PackageFileRole, ProblemAsset>();
  for (const asset of assets) {
    const role = supportRoleFromAsset(asset);
    if (role) grouped.set(role, asset);
  }
  return grouped;
}

/** Keep older package-status responses from displaying an auxiliary as a header. */
export function supportFileStatus(file: PackageSupportFileStatus) {
  if (
    file.role === 'package-resource' &&
    file.latest_filename &&
    supportFilename(file.latest_filename) !== 'testlib.h'
  )
    return {
      ...file,
      latest_filename: null,
      count: 0,
      status: 'missing' as const,
    };
  return file;
}
