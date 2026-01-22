import { test } from 'node:test';
import assert from 'node:assert';
import { file } from './index.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kv-conf-test-'));
const fixturesDir = path.join(import.meta.dirname, 'fixtures');

async function setupFixture(name) {
  const sourcePath = path.join(fixturesDir, name);
  const targetPath = path.join(tempDir, name);
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

test.after(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('parse simple key-value', async () => {
  const f = await file(await setupFixture('simple.kv'));
  assert.strictEqual(f.data.name, 'Brian');
  assert.strictEqual(f.data.age, 30);
});

test('parse nested objects', async () => {
  const f = await file(await setupFixture('nested.kv'));
  assert.strictEqual(f.data.user.name, 'Brian');
  assert.strictEqual(f.data.user.email, 'brian@example.com');
});

test('parse lists', async () => {
  const f = await file(await setupFixture('list.kv'));
  assert.deepStrictEqual(f.data.likes, ['football', 'large language models', 'ice cream, cones']);
});

test('parse booleans', async () => {
  const f = await file(await setupFixture('bool.kv'));
  assert.strictEqual(f.data.enabled, true);
  assert.strictEqual(f.data.disabled, false);
});

test('parse numbers', async () => {
  const f = await file(await setupFixture('numbers.kv'));
  assert.strictEqual(f.data.integer, 42);
  assert.strictEqual(f.data.hex, 0xFF);
  assert.strictEqual(f.data.float, 3.14);
  assert.strictEqual(f.data.sci, 1.5e10);
});

test('get value', async () => {
  const f = await file(await setupFixture('get.kv'));
  assert.strictEqual(await f.get('name'), 'Test');
  assert.strictEqual(await f.get('nested.key'), 'value');
  assert.strictEqual(await f.get('missing', 'default'), 'default');
});

test('get throws on missing key', async () => {
  const f = await file(await setupFixture('get-throw.kv'));
  await assert.rejects(
    async () => await f.get('missing'),
    { message: 'Key not found: missing' }
  );
});

test('set value', async () => {
  const f = await file(await setupFixture('set.kv'));
  await f.set('newKey', 'newValue');
  assert.strictEqual(await f.get('newKey'), 'newValue');

  await f.set('nested.newKey', 'nestedValue');
  assert.strictEqual(await f.get('nested.newKey'), 'nestedValue');
});

test('merge object', async () => {
  const f = await file(await setupFixture('merge.kv'));
  await f.merge({ newKey: 'value', nested: { newNested: 'value2' } });
  assert.strictEqual(await f.get('newKey'), 'value');
  assert.strictEqual(await f.get('nested.newNested'), 'value2');
  assert.strictEqual(await f.get('existingKey'), 'existingValue');
});

test('delete key', async () => {
  const f = await file(await setupFixture('delete.kv'));
  assert.strictEqual(await f.get('toDelete'), 'value');

  await f.delete('toDelete');
  assert.strictEqual(await f.has('toDelete'), false);
});

test('has key', async () => {
  const f = await file(await setupFixture('has.kv'));
  assert.strictEqual(await f.has('existingKey'), true);
  assert.strictEqual(await f.has('nonExistentKey'), false);
  assert.strictEqual(await f.has('nested.key'), true);
});

test('each callback', async () => {
  const f = await file(await setupFixture('each.kv'));
  const keys = [];

  await f.each((key, value) => {
    keys.push(key);
  });

  assert.ok(keys.includes('name'));
  assert.ok(keys.includes('nested.key'));
  assert.ok(keys.includes('list'));
});

test('write preserves data', async () => {
  const f1 = await file(await setupFixture('write1.kv'));
  await f1.write();

  const f2 = await file(await setupFixture('write1.kv'));
  assert.strictEqual(await f2.get('name'), 'Test');
  assert.strictEqual(await f2.get('nested.key'), 'value');
});

test.skip('write after modification', async () => {
  const f1 = await file(await setupFixture('write2.kv'));
  await f1.set('newKey', 'newValue');
  await f1.write();

  const f2 = await file(await setupFixture('write2.kv'));
  assert.strictEqual(await f2.get('newKey'), 'newValue');
});
