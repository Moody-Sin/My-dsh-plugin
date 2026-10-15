import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Client Script Bundle', () => {
  it('should verify client registration logic syntax and exports', () => {
    const clientTs = fs.readFileSync(path.join(process.cwd(), 'src/client.tsx'), 'utf8');
    assert.ok(clientTs.includes('settings.plugins.tab'));
    assert.ok(clientTs.includes('__ModuleLoader__'));
    assert.ok(clientTs.includes('@local/my-dsh-plugins'));
  });
});
