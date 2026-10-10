import { describe, expect, it } from 'vitest';
import { CONTRACTS_VERSION } from '@paisa/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { FIXTURES } from './helpers';

describe('GET /health', () => {
  it('reports ok and the contracts version', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', CONTENT_DIR: FIXTURES }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', contractsVersion: CONTRACTS_VERSION });
    await app.close();
  });
});
