/**
 * Static checks that keep the PWA deployable on GitHub Pages:
 * relative paths, a complete offline cache, valid icons, and no external URLs.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const RUNTIME_FILES = ['index.html', 'manifest.json', ...walk('css'), ...walk('js'), ...walk('icons')].sort();

function pngSize(path) {
  const buf = readFileSync(join(ROOT, path));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

describe('GitHub Pages', () => {
  test('.nojekyll exists', () => {
    assert.ok(existsSync(join(ROOT, '.nojekyll')));
  });

  test('index.html uses only relative paths', () => {
    const html = read('index.html');
    for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      assert.ok(!url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(url), `not relative: ${url}`);
    }
  });
});

describe('manifest and icons', () => {
  const manifest = JSON.parse(read('manifest.json'));

  test('start_url, scope and id are relative', () => {
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.id, './');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name && manifest.short_name);
  });

  test('icons exist at their declared sizes', () => {
    const sizes = new Set();
    for (const icon of manifest.icons) {
      assert.ok(!icon.src.startsWith('/'), `${icon.src} must be relative`);
      const { width, height } = pngSize(icon.src);
      assert.equal(`${width}x${height}`, icon.sizes, icon.src);
      sizes.add(icon.sizes);
    }
    assert.ok(sizes.has('192x192') && sizes.has('512x512'));
  });

  test('apple-touch-icon is an opaque 180×180 PNG', () => {
    const html = read('index.html');
    const href = /<link rel="apple-touch-icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
    assert.ok(href, 'apple-touch-icon link missing');
    const { width, height, colourType } = pngSize(href);
    assert.deepEqual([width, height], [180, 180]);
    assert.equal(colourType, 2, 'should be RGB without alpha');
  });

  test('iOS home-screen meta tags are present', () => {
    const html = read('index.html');
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="[a-z-]+"/);
    assert.match(html, /<meta name="viewport" content="[^"]*viewport-fit=cover/);
    assert.match(html, /<link rel="manifest" href="manifest.json"/);
  });
});

describe('service worker', () => {
  const sw = read('sw.js');
  const precache = [...sw.matchAll(/^\s+'\.\/([^']+)',$/gm)].map((m) => m[1]).sort();

  test('precaches exactly the runtime files', () => {
    assert.deepEqual(precache, RUNTIME_FILES);
  });

  test('version matches js/version.js', () => {
    const swVersion = /const VERSION = '([^']+)'/.exec(sw)?.[1];
    const appVersion = /APP_VERSION = '([^']+)'/.exec(read('js/version.js'))?.[1];
    assert.ok(swVersion);
    assert.equal(swVersion, appVersion);
  });

  test('is registered with a relative URL and scope', () => {
    const pwa = read('js/pwa.js');
    assert.match(pwa, /register\('\.\/sw\.js', \{ scope: '\.\/'/);
  });
});

describe('privacy', () => {
  test('no external URLs in anything the app loads', () => {
    const allowed = new Set(['http://www.w3.org/2000/svg']);
    for (const file of [...RUNTIME_FILES.filter((f) => !f.endsWith('.png')), 'sw.js']) {
      for (const match of read(file).matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
        assert.ok(allowed.has(match[0]), `${file} references ${match[0]}`);
      }
    }
  });

  test('a Content-Security-Policy restricts loading to this site', () => {
    assert.match(read('index.html'), /Content-Security-Policy"\s+content="default-src 'self'/);
  });

  test('every JS module imports only relative paths', () => {
    for (const file of RUNTIME_FILES.filter((f) => f.endsWith('.js'))) {
      for (const match of read(file).matchAll(/^import .* from '([^']+)';$/gm)) {
        assert.ok(match[1].startsWith('./') || match[1].startsWith('../'), `${relative(ROOT, file)}: ${match[1]}`);
      }
    }
  });
});
