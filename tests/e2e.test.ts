import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Build and Bundle Integration', () => {
  it('should generate valid index.js and client.js on build', () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'client.js')), 'client.js should exist');
    assert.ok(fs.existsSync(path.join(process.cwd(), 'index.js')), 'index.js should exist');
  });
});
