#!/usr/bin/env node
/**
 * Bump the app version everywhere it appears (sw.js, js/version.js,
 * package.json).
 *
 *   npm run bump            # 1.0.0 -> 1.0.1
 *   npm run bump -- minor   # 1.0.1 -> 1.1.0
 *   npm run bump -- 2.0.0   # set an exact version
 *
 * Fixes reach installed apps even without a bump (the service worker re-checks
 * every file), but bumping gives the offline cache a fresh name and shows the
 * new number in Settings → About, so you can see the update landed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  sw: join(ROOT, 'sw.js'),
  app: join(ROOT, 'js/version.js'),
  pkg: join(ROOT, 'package.json'),
};

const sw = readFileSync(files.sw, 'utf8');
const current = /const VERSION = '(\d+)\.(\d+)\.(\d+)'/.exec(sw);
if (!current) throw new Error('VERSION not found in sw.js');
let [major, minor, patch] = current.slice(1).map(Number);

const arg = process.argv[2] || 'patch';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'major') next = `${major + 1}.0.0`;
else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
else if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
else throw new Error(`Unknown version "${arg}". Use patch, minor, major or x.y.z.`);

writeFileSync(files.sw, sw.replace(/const VERSION = '[^']+'/, `const VERSION = '${next}'`));
const app = readFileSync(files.app, 'utf8');
writeFileSync(files.app, app.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`));
const pkg = JSON.parse(readFileSync(files.pkg, 'utf8'));
pkg.version = next;
writeFileSync(files.pkg, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Version ${current.slice(1).join('.')} -> ${next}`);
