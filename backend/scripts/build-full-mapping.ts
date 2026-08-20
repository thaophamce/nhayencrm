import fs from 'fs';

// Đọc file mapping từ VPS
const mappingLines = fs.readFileSync('scripts/vps-full-mapping.txt', 'utf-8')
  .split('\n')
  .filter(line => line.trim());

const mapping: Record<string, string> = {};

for (const line of mappingLines) {
  const [externalThreadId, conversationId] = line.split('|');
  if (externalThreadId && conversationId) {
    mapping[externalThreadId.trim()] = conversationId.trim();
  }
}

console.log(`Loaded ${Object.keys(mapping).length} conversations from VPS`);

// Ghi ra file TypeScript
const content = `// Auto-generated VPS mapping from ${new Date().toISOString()}
// Total: ${Object.keys(mapping).length} conversations

export const vpsMapping: Record<string, string> = ${JSON.stringify(mapping, null, 2)};
`;

fs.writeFileSync('scripts/vps-mapping-full.ts', content);
console.log('✓ Saved to scripts/vps-mapping-full.ts');
