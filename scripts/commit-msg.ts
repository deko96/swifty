const TYPES = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'chore',
  'ci',
  'perf',
  'build',
  'style',
  'revert',
];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: .{1,80}$`);
const EXEMPT = /^(Merge |Revert |fixup! |squash! )/;

const file = process.argv[2];
if (!file) {
  console.error('usage: bun scripts/commit-msg.ts <commit-msg-file>');
  process.exit(1);
}

const header = (await Bun.file(file).text()).split('\n')[0] ?? '';

if (EXEMPT.test(header) || HEADER.test(header)) {
  process.exit(0);
}

console.error(`Invalid commit message header:\n\n  ${header}\n`);
console.error(`Expected Conventional Commits format: type(scope): subject`);
console.error(`  types:  ${TYPES.join(', ')}`);
console.error(`  scopes: api, web, sdk, templates, daemon (optional)`);
console.error(`  example: feat(api): add server power actions endpoint`);
process.exit(1);
