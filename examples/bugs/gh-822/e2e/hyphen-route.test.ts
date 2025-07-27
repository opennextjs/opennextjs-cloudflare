import { expect, test } from '@playwright/test';

test.describe('Hyphen in Dynamic Route', () => {
  test('should handle dynamic route with hyphen in slug', async ({ page }) => {
    // Test the route with hyphen
    const response = await page.goto('/api/auth/better-auth/test');
    expect(response?.status()).toBe(200);
    
    const json = await response?.json();
    expect(json).toMatchObject({
      message: 'Better Auth route accessed successfully',
      segments: ['test']
    });
  });

  test('should handle POST request to dynamic route with hyphen', async ({ page }) => {
    const response = await page.request.post('/api/auth/better-auth/signin', {
      data: { username: 'test', password: 'test' }
    });
    
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.message).toBe('POST request to Better Auth route');
  });

  test('should handle nested segments in dynamic route with hyphen', async ({ page }) => {
    const response = await page.goto('/api/auth/better-auth/signin/callback');
    expect(response?.status()).toBe(200);
    
    const json = await response?.json();
    expect(json.segments).toEqual(['signin', 'callback']);
  });
});