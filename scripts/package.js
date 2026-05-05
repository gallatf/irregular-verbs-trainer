import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import archiver from 'archiver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_FILES = [
  'irregular-verbs-flashcards.html',
  'styles.css',
  'app.js',
  'logic.js',
  'privacy.html',
];

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

function getGitRef() {
  try {
    return execSync('git describe --tags --exact-match', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  }
}

function validateConfig(configPath) {
  const src = readFileSync(configPath, 'utf8');
  if (src.includes('your-project-id') || src.includes('your-anon-key')) {
    fail(`${configPath} still contains placeholder values. Fill in real credentials first.`);
  }
}

async function buildPackage(env, ref) {
  const configSrc = join(ROOT, 'app', `supabase_config.${env}.js`);
  if (!existsSync(configSrc)) {
    fail(`app/supabase_config.${env}.js not found. Copy app/supabase_config.example.js and fill in real credentials.`);
  }
  validateConfig(configSrc);

  const stageDir = join(ROOT, 'dist', env);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(join(stageDir, 'app'), { recursive: true });
  mkdirSync(join(stageDir, 'data'), { recursive: true });

  for (const f of APP_FILES) {
    cpSync(join(ROOT, 'app', f), join(stageDir, 'app', f));
  }
  cpSync(configSrc, join(stageDir, 'app', 'supabase_config.js'));
  cpSync(join(ROOT, 'data', 'irregular-verbs.json'), join(stageDir, 'data', 'irregular-verbs.json'));
  cpSync(join(ROOT, 'index.html'), join(stageDir, 'index.html'));

  writeFileSync(
    join(stageDir, 'version.json'),
    JSON.stringify({ ref, builtAt: new Date().toISOString() }, null, 2)
  );

  const archiveName = `irregular-verbs-trainer-${ref}-${env}.zip`;
  const archivePath = join(ROOT, 'dist', archiveName);

  let bytes = 0;
  await new Promise((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => { bytes = archive.pointer(); resolve(); });
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(stageDir, false);
    archive.finalize();
  });

  console.log(`  dist/${archiveName}  (${(bytes / 1024).toFixed(1)} KB)`);
}

const ref = getGitRef();
const envIndex = process.argv.indexOf('--env');
const envArg = envIndex !== -1 ? process.argv[envIndex + 1] : null;
const envs = envArg ? [envArg] : ['dev', 'prod'];

if (envArg && !['dev', 'prod'].includes(envArg)) {
  fail(`Unknown env "${envArg}". Use --env dev or --env prod.`);
}

console.log(`\nPackaging irregular-verbs-trainer @ ${ref}\n`);
for (const env of envs) {
  await buildPackage(env, ref);
}
console.log('\nDone.');
