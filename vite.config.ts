import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const repository = fileURLToPath(new URL('.', import.meta.url));

function revision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
  } catch {
    return null;
  }
}

function frontendVersion(version: string, commit: string | null): Plugin {
  const builtAt = new Date().toISOString();
  return {
    name: 'zoj-frontend-version',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'zoj-frontend-version', content: version },
          injectTo: 'head',
        },
      ];
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entries = Object.values(bundle).filter(
          (output) => output.type === 'chunk' && output.isEntry,
        );
        if (entries.length !== 1 || !bundle['index.html']) {
          throw new Error(
            'Frontend version requires one HTML application entry',
          );
        }
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source:
            JSON.stringify({
              schemaVersion: 1,
              version,
              revision: commit,
              builtAt,
              entry: '/' + entries[0].fileName,
            }) + '\n',
        });
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const commit = command === 'build' ? revision() : null;
  const version =
    command === 'build'
      ? (process.env.ZOJ_FRONTEND_VERSION?.trim() ?? commit)
      : '';
  if (
    command === 'build' &&
    (!version || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(version))
  ) {
    throw new Error('Set ZOJ_FRONTEND_VERSION to a valid release identifier');
  }
  return {
    define: {
      'import.meta.env.VITE_FRONTEND_VERSION': JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': 'https://zoj.kr',
      },
    },
    plugins: [react(), tailwindcss(), frontendVersion(version ?? '', commit)],
  };
});
