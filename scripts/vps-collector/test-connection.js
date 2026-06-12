/**
 * Test connection to Supabase and verify environment.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

async function test() {
  console.log('=== OutEye VPS Collector — Connection Test ===\n');

  // Check env vars
  const checks = [
    { name: 'SUPABASE_URL', value: process.env.SUPABASE_URL },
    { name: 'SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY },
    { name: 'PROJECT_ID', value: process.env.PROJECT_ID },
  ];

  for (const c of checks) {
    console.log(`${c.name}: ${c.value ? '✓ set' : '✗ MISSING'}`);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('\nMissing required env vars. Copy .env.example to .env and fill in values.');
    process.exit(1);
  }

  // Test Supabase connection
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  console.log('\nTesting Supabase connection...');

  const { data: projects, error: pErr } = await supabase.from('projects').select('id, name').limit(3);
  if (pErr) {
    console.log(`✗ Projects query failed: ${pErr.message}`);
  } else {
    console.log(`✓ Projects: ${projects.length} found`);
    for (const p of projects) {
      console.log(`  - ${p.name} (${p.id})`);
    }
  }

  const { count, error: cErr } = await supabase.from('comments').select('*', { count: 'exact', head: true });
  if (cErr) {
    console.log(`✗ Comments query failed: ${cErr.message}`);
  } else {
    console.log(`✓ Comments table: ${count} rows`);
  }

  console.log('\n=== Test Complete ===');
}

test().catch(console.error);
