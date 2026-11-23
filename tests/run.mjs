// Transpiles the pure TypeScript modules under test, then runs the Node test files.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'tests/.build');
const files = { 'shared/schema.ts': 'schema.js', 'shared/sync-server.ts': 'sync-server.js', 'src/import/parse.ts': 'import/parse.js', 'src/import/plan.ts': 'import/plan.js' };
rmSync(out, { recursive: true, force: true });
for (const [src, dest] of Object.entries(files)) {
  const code = ts.transpileModule(readFileSync(join(root, src), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.js'");
  mkdirSync(dirname(join(out, dest)), { recursive: true });
  writeFileSync(join(out, dest), code);
}
let failed = false;
for (const f of readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs'))) {
  console.log(`\n▶ ${f}`);
  try { execFileSync(process.execPath, ['--no-warnings', join(root, 'tests', f)], { stdio: 'inherit' }); }
  catch { failed = true; }
}
process.exit(failed ? 1 : 0);
