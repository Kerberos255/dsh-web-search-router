import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { schema } from '../lib/config.js';
import { ConfigFile } from '../lib/plugin-settings/file-config.js';
import { tmpdir } from 'node:os';

test('the JSON file owns search settings; saves preserve endpoint fields and reject stale revisions', t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'dsh-web-search-router-'));
  const file = new ConfigFile(path.join(root, 'config.json'), { ...schema, watch: false });
  t.after(() => { file.close(); assert.ok(root.startsWith(path.resolve(tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
  const first = file.snapshot();
  const saved = file.save({ ...first.value, searxngBaseURL: 'http://127.0.0.1:8080', timeoutMs: 5000 }, first.revision);
  assert.equal(saved.value.timeoutMs, 5000);
  assert.equal(JSON.parse(fs.readFileSync(file.filename)).searxngBaseURL, 'http://127.0.0.1:8080');
  assert.throws(() => file.save(first.value, first.revision), { code: 'config-conflict' });
  fs.writeFileSync(file.filename, JSON.stringify({ ...saved.value, timeoutMs: 10000 }));
  assert.throws(() => file.save(saved.value, saved.revision), { code: 'config-conflict' });
  assert.equal(file.reload().value.timeoutMs, 10000);
});
test('search configuration rejects empty, unknown or duplicated providers and non-HTTP URLs', () => {
  for (const patch of [{ enabledProviders: [] }, { enabledProviders: ['unknown'] }, { enabledProviders: ['brave', 'brave'] },
    { order: ['brave'] }, { searxngBaseURL: 'file:///search' }, { searxngBaseURL: 'https://user:pass@search.example' },
    { searxngBaseURL: 'not a url' }, { timeoutMs: '5000' },
    { timeoutMs: 45000 }, { cooldownSeconds: 3 }, { deepseekBaseURL: 'https://api.deepseek.com/anthropic/v1' },
    { deepseekModel: 'deepseek-v4-flash' }, { deepseekApiKeyEnv: 'DEEPSEEK_API_KEY' }, { apiKey: 'forbidden' }])
    assert.throws(() => schema.validate(patch), { code: 'invalid-config' });
});
