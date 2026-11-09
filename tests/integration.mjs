import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/202611080001_mindspark_progress.sql', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('../cloud-sync.js', import.meta.url), 'utf8');
assert.match(sql, /enable row level security/i);
assert.match(sql, /force row level security/i);
assert.match(sql, /for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(sql, /for insert to authenticated\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(sql, /for update to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(sql, /revoke all .* from anon/i);
assert.doesNotMatch(sql, /service_role/i);
assert.match(cloud, /\.eq\("user_id", user\.id\)/);
assert.match(cloud, /\.eq\("updated_at", row\.updated_at\)/, 'sync uses optimistic concurrency to avoid overwriting parallel device updates');
assert.match(cloud, /CACHE_PREFIX \+ owner/, 'account switching snapshots the previous local data');
assert.match(cloud, /CACHE_PREFIX \+ user\.id/, 'account switching restores only that account cache');
assert.match(cloud, /Guest mode remains available/);
console.log('MindSpark backend isolation and sync contract checks passed');
