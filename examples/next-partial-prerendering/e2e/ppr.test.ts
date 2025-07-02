import { expect, test } from '@playwright/test';

test.describe('PPR', () => {
	test('PPR should show loading first', async ({ page }) => {
		await page.goto('/', { waitUntil: 'commit' });
		await expect(
			page.getByRole('heading', { name: 'Partial Prerendering' }),
		).toBeVisible();

		const loader = page.getByTestId('reviews-loader');
		await expect(loader).toBeVisible();
		await expect(page.getByText('Customer Reviews')).toHaveCount(0);

		await page.waitForTimeout(6000);
		await expect(page.getByText('Customer Reviews')).toBeVisible();
		await expect(loader).not.toBeVisible();
	});

	test('PPR rsc prefetch request should be cached', async ({ request }) => {
		const resp = await request.get('/', {
			headers: { rsc: '1', 'next-router-prefetch': '1' },
		});
		expect(resp.status()).toEqual(200);

		const headers = resp.headers();
		expect(headers['x-nextjs-postponed']).toEqual('1');
		expect(headers['x-nextjs-cache']).toEqual('HIT');
		expect(headers['cache-control']).toEqual(
			's-maxage=31536000, stale-while-revalidate=2592000',
		);
	});
});
