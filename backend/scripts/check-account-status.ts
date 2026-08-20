import pg from 'pg';

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://crmuser:ccc391ded4c548dfaf4f234733a6f143@localhost:5433/zalocrm'
  });

  await client.connect();

  // Check account status
  const accountResult = await client.query(`
    SELECT id, display_name, status, last_connected_at
    FROM zalo_accounts
    WHERE display_name LIKE '%Thiệp Cưới%'
    LIMIT 1
  `);

  console.log('Account Thiệp Cưới trên LOCAL:');
  console.log(JSON.stringify(accountResult.rows[0], null, 2));

  if (accountResult.rows.length > 0) {
    const accountId = accountResult.rows[0].id;

    // Check if there are any recent message sync activities
    const recentMessages = await client.query(`
      SELECT COUNT(*) as count, MAX(created_at) as latest_message
      FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE account_id = $1
      )
    `, [accountId]);

    console.log('\nRecent message activity:');
    console.log(JSON.stringify(recentMessages.rows[0], null, 2));
  }

  await client.end();
}

main().catch(console.error);
