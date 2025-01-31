'use client';

import { useCartCount } from '#/components/cart-count-context';

export function CartCount({ initialCartCount }: { initialCartCount: number }) {
  const [count] = useCartCount(initialCartCount);
  return <span>{count}</span>;
}
