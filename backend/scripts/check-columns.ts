// Check zalo_accounts columns
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'crmuser',
  password: 'ccc391ded4c548dfaf4f234733a6f143',
  database: 'zalocrm',
});

async function checkColumns() {
  try {
    await client.connect();

    console.log('=== zalo_accounts ===');
    let res = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'zalo_accounts'
      ORDER BY ordinal_position;
    `);
    res.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));

    console.log('\n=== conversations ===');
    res = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'conversations'
      ORDER BY ordinal_position;
    `);
    res.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));

    console.log('\n=== messages ===');
    res = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
      LIMIT 15;
    `);
    res.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));

  } finally {
    await client.end();
  }
}

checkColumns().catch(console.error);
