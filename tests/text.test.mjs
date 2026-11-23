import assert from 'node:assert/strict';
import { markdownToText } from './.build/text.js';

const md = `Faith in the Middle

**Exodus 14:10–16**

> "The Lord will fight for you; you need only to be still." — Exodus 14:14

## Context

The Israelites had *just* escaped Egypt. See [notes](https://example.com) and \`code\`.

- This is where the message begins—
- that God allows difficult places

1. First point
2. Second point

![Red Sea map](https://example.com/map.jpg)

- [ ] Name your Red Sea
- [x] Pray Exodus 14:14

---

\`\`\`
verbatim **stays**
\`\`\`
`;
const out = markdownToText(md);
console.log(out);
assert.ok(out.includes('Exodus 14:10–16') && !out.includes('**Exodus'));
assert.ok(out.includes('  │ "The Lord will fight for you'));
assert.ok(out.includes('Context\n-------'));
assert.ok(out.includes('had just escaped') && out.includes('notes (https://example.com)') && out.includes('and code.'));
assert.ok(out.includes('• This is where'));
assert.ok(out.includes('1. First point'));
assert.ok(out.includes('[ ] Name your Red Sea') && out.includes('[x] Pray'));
assert.ok(out.includes('    verbatim **stays**'));
assert.ok(out.includes('[Image: Red Sea map] https://example.com/map.jpg'));
console.log('✓ Markdown → plain text');
