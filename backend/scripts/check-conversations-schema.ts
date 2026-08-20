import pg from 'pg';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  const result = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'conversations'
    ORDER BY ordinal_position
  `);

  console.log('Conversations table schema:');
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
}

main().catch(console.error);
