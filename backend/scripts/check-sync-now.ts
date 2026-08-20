import pg from 'pg';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      threadType,
      COUNT(*) as conversations,
      COUNT(DISTINCT m.id) as messages,
      MAX(m.created_at) as latest_message
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.account_id = '75531187-1d0f-44d9-a75b-08cb0c8204c3'
    GROUP BY threadType
    ORDER BY threadType
  `);

  console.log('Thiệp Cưới LOCAL hiện tại:');
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
}

main().catch(console.error);
