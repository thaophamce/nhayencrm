import fs from 'fs';

const threadIds: string[] = JSON.parse(fs.readFileSync('scripts/thread-ids.json', 'utf-8'));

console.log(`Total threads from LOCAL: ${threadIds.length}`);
console.log('\nGenerate VPS query:\n');

// Split into chunks of 50 for manageable queries
const chunkSize = 50;
for (let i = 0; i < threadIds.length; i += chunkSize) {
  const chunk = threadIds.slice(i, i + chunkSize);
  const ids = chunk.map(id => `'${id}'`).join(',');
  console.log(`-- Chunk ${Math.floor(i/chunkSize) + 1}:`);
  console.log(`SELECT external_thread_id, id FROM conversations WHERE zalo_account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3' AND external_thread_id IN (${ids});\n`);
}
