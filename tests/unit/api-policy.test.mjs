// Unit tests for the API client's error classification and retry rules
// (lib/api-policy.ts). Node ≥ 23 runs the TypeScript module directly:
//   npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { backoffMs, classifyStatus, classifyThrown, isTransient, shouldRetry } from '../../lib/api-policy.ts';

test('classifies HTTP answers', () => {
  assert.equal(classifyStatus(503, 'MAINTENANCE'), 'maintenance');
  assert.equal(classifyStatus(503, 'DB_UNAVAILABLE'), 'unavailable');
  assert.equal(classifyStatus(503, 'DB_TIMEOUT'), 'unavailable');
  assert.equal(classifyStatus(503, 'SERVER_BUSY'), 'busy');
  assert.equal(classifyStatus(503), 'unavailable');
  assert.equal(classifyStatus(502), 'unavailable');
  assert.equal(classifyStatus(504), 'unavailable');
  assert.equal(classifyStatus(429), 'busy');
  assert.equal(classifyStatus(500), 'server');
  assert.equal(classifyStatus(422), 'client');
  assert.equal(classifyStatus(404), 'client');
  assert.equal(classifyStatus(409, 'PRICE_CHANGED'), 'client');
});

test('classifies failed fetches', () => {
  assert.equal(classifyThrown(new TypeError('Failed to fetch'), { timedOut: true, online: true }), 'timeout');
  assert.equal(classifyThrown(new TypeError('Failed to fetch'), { timedOut: false, online: false }), 'offline');
  assert.equal(classifyThrown(new TypeError('Failed to fetch'), { timedOut: false, online: true }), 'network');
  assert.equal(isTransient('client'), false);
  assert.equal(isTransient('network'), true);
});

test('GETs are retried for transient failures only', () => {
  for (const kind of ['network', 'timeout', 'unavailable', 'busy', 'server']) {
    assert.equal(shouldRetry({ method: 'GET', kind, attempt: 1, maxRetries: 2 }), true, kind);
  }
  assert.equal(shouldRetry({ method: 'GET', kind: 'client', attempt: 1, maxRetries: 2 }), false);
  assert.equal(shouldRetry({ method: 'GET', kind: 'maintenance', attempt: 1, maxRetries: 2 }), false);
  assert.equal(shouldRetry({ method: 'GET', kind: 'offline', attempt: 1, maxRetries: 2 }), false);
  assert.equal(shouldRetry({ method: 'GET', kind: 'network', attempt: 3, maxRetries: 2 }), false, 'max retries');
});

test('POST/PUT/PATCH/DELETE (payments, bookings) are never auto-retried without idempotency', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(shouldRetry({ method, kind: 'network', attempt: 1, maxRetries: 5 }), false, method);
    assert.equal(shouldRetry({ method, kind: 'unavailable', attempt: 1, maxRetries: 5 }), false, method);
  }
  // Idempotent server operation (e.g. PayPal capture: settle-once) may be repeated
  assert.equal(shouldRetry({ method: 'POST', kind: 'timeout', attempt: 1, maxRetries: 2, idempotent: true }), true);
  assert.equal(shouldRetry({ method: 'POST', kind: 'client', attempt: 1, maxRetries: 2, idempotent: true }), false);
});

test('backoff grows, is capped and honours Retry-After', () => {
  const mid = () => 0.5;
  assert.equal(backoffMs(1, null, mid), 500);
  assert.equal(backoffMs(2, null, mid), 1000);
  assert.equal(backoffMs(3, null, mid), 2000);
  assert.equal(backoffMs(10, null, mid), 8000);
  assert.equal(backoffMs(1, 5, mid), 5000);
  assert.equal(backoffMs(1, 120, mid), 10000, 'Retry-After capped at 10 s for in-request retries');
});
