// PNG icons are stored as base64 text (so the repo can be pushed as text files) and written out before each build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const icons = JSON.parse(readFileSync(new URL('./icons.b64.json', import.meta.url), 'utf8'));
mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const [name, b64] of Object.entries(icons)) {
  const target = new URL(`../public/icons/${name}`, import.meta.url);
  writeFileSync(target, Buffer.from(b64, 'base64')); // always overwrite so icon updates reach the build
}
