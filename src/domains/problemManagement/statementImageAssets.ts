import type { ProblemAsset } from './types';
import type { StatementImageAsset } from '@/shared/lib/statementImages';

export function statementImageAsset(asset: ProblemAsset): StatementImageAsset {
  return {
    id: asset.asset_id,
    source: `asset://${asset.asset_id}`,
    name: asset.original_filename,
    previewUrl: asset.download_url || undefined,
  };
}

export function publicStatementImages(assets: ProblemAsset[]): ProblemAsset[] {
  return assets.filter(
    (asset) =>
      asset.mime_type.startsWith('image/') &&
      !asset.storage_key.includes('/editorial-assets/'),
  );
}
