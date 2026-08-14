import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { normalizeExercise } from './lib/exercise-normalizer';
import type { Database, Json, TablesInsert } from '../src/types/database';

const REPOSITORY = 'hasaneyldrm/exercises-dataset';
const DATA_PATH = 'data/exercises.json';
const CHUNK_SIZE = 200;

const commitSchema = z.object({ sha: z.string().min(7) });
const datasetSchema = z.array(z.unknown()).min(1);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const version = await getSourceVersion();
  const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${version}/${DATA_PATH}`);
  if (!response.ok) throw new Error(`Dataset download failed: ${response.status} ${response.statusText}`);

  const sourceRows = datasetSchema.parse(await response.json());
  const rows = sourceRows.map((row) => normalizeExercise(row, version));
  const ids = new Set(rows.map((row) => row.id));
  if (ids.size !== rows.length) throw new Error(`Duplicate source IDs detected: ${rows.length - ids.size}`);

  console.log(`Validated ${rows.length} exercises at source commit ${version}.`);
  const dumpChunk = process.argv.find((argument: string) => argument.startsWith('--dump-chunk='));
  if (dumpChunk) {
    const [offset, size] = dumpChunk.slice('--dump-chunk='.length).split(':').map(Number);
    if (!Number.isInteger(offset) || !Number.isInteger(size) || offset < 0 || size < 1) {
      throw new Error('Use --dump-chunk=<zero-based-offset>:<positive-size>.');
    }
    process.stdout.write(`\n__PROTEINOS_EXERCISES_BEGIN__${JSON.stringify(rows.slice(offset, offset + size))}__PROTEINOS_EXERCISES_END__\n`);
    return;
  }
  if (dryRun) return;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for this trusted import script.');
  }

  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk: TablesInsert<'exercise_catalog'>[] = rows.slice(offset, offset + CHUNK_SIZE).map((row) => ({
      ...row,
      attribution: row.attribution as Json,
    }));
    const { error } = await client.from('exercise_catalog').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed at row ${offset}: ${error.message}`);
    console.log(`Upserted ${Math.min(offset + chunk.length, rows.length)} / ${rows.length}`);
  }

  const { count, error } = await client.from('exercise_catalog').select('id', { count: 'exact', head: true }).eq('source_version', version);
  if (error) throw error;
  if (count !== rows.length) throw new Error(`Integrity check failed: expected ${rows.length}, found ${count ?? 0}`);
  console.log(`Import complete. ${count} records verified for ${version}.`);
}

async function getSourceVersion() {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/commits?path=${encodeURIComponent(DATA_PATH)}&per_page=1`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ProteinOS-exercise-sync' },
  });
  if (!response.ok) throw new Error(`Commit lookup failed: ${response.status} ${response.statusText}`);
  const commits = z.array(commitSchema).min(1).parse(await response.json());
  return commits[0].sha;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
