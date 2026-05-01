import { test, expect } from '../helpers/fixtures.js';

function uniquePath(): string {
  return `/tmp/test-space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test.describe('Spaces endpoints', () => {
  test('authenticated GET /api/spaces returns 200 with spaces array', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/spaces');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('spaces');
    expect(Array.isArray(body.spaces)).toBe(true);
  });

  test('POST /api/spaces creates a space and returns 201 with space object', async ({ authedRequest }) => {
    const spacePath = uniquePath();
    const response = await authedRequest.post('/api/spaces', {
      data: { path: spacePath },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('space');
    expect(body.space).toHaveProperty('id');
    expect(body.space).toHaveProperty('path', spacePath);
  });

  test('POST /api/spaces with duplicate path returns 409', async ({ authedRequest }) => {
    const spacePath = uniquePath();

    // Create it once
    const first = await authedRequest.post('/api/spaces', {
      data: { path: spacePath },
    });
    expect(first.status()).toBe(201);

    // Create same path again
    const second = await authedRequest.post('/api/spaces', {
      data: { path: spacePath },
    });
    expect(second.status()).toBe(409);
  });

  test('GET /api/spaces/:id returns 200 for existing space', async ({ authedRequest }) => {
    // Create a space first
    const spacePath = uniquePath();
    const created = await authedRequest.post('/api/spaces', {
      data: { path: spacePath },
    });
    const { space } = await created.json();

    const response = await authedRequest.get(`/api/spaces/${space.id}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('space');
    expect(body.space.id).toBe(space.id);
  });

  test('GET /api/spaces/nonexistentid returns 404', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/spaces/nonexistentid-that-does-not-exist');
    expect(response.status()).toBe(404);
  });

  test('DELETE /api/spaces/:id removes the space', async ({ authedRequest }) => {
    // Create a space to delete
    const spacePath = uniquePath();
    const created = await authedRequest.post('/api/spaces', {
      data: { path: spacePath },
    });
    const { space } = await created.json();

    // Delete it
    const deleteResponse = await authedRequest.delete(`/api/spaces/${space.id}`);
    expect([200, 204]).toContain(deleteResponse.status());

    // Verify it's gone
    const getResponse = await authedRequest.get(`/api/spaces/${space.id}`);
    expect(getResponse.status()).toBe(404);
  });
});
