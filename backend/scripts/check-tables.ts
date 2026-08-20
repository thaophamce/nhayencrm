// Check database tables
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'crmuser',
  password: 'ccc391ded4c548dfaf4f234733a6f143',
  database: 'zalocrm',
});

async function checkTables() {
  try {
    await client.connect();

    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%alo%'
      ORDER BY table_name;
    `);

    console.log('Tables matching "alo":');
    res.rows.forEach(row => console.log('  ', row.table_name));

  } finally {
    await client.end();
  }
}

checkTables().catch(console.error);
