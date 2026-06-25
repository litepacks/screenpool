import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'http/createScreenPoolServer': 'src/http/createScreenPoolServer.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: {
    js: '',
  },
  esbuildOptions(options) {
    options.banner = {
      js: '',
    };
  },
  onSuccess: async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const cliPath = 'dist/cli.js';
    const content = await readFile(cliPath, 'utf8');
    if (!content.startsWith('#!')) {
      await writeFile(cliPath, `#!/usr/bin/env node\n${content}`);
    }
  },
});
