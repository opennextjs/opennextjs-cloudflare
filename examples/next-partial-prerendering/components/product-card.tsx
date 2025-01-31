import { Product } from '#/types/product';
import { ProductBestSeller } from '#/components/product-best-seller';
import { ProductEstimatedArrival } from '#/components/product-estimated-arrival';
import { ProductLowStockWarning } from '#/components/product-low-stock-warning';
import { ProductPrice } from '#/components/product-price';
import { ProductRating } from '#/components/product-rating';
import { ProductUsedPrice } from '#/components/product-used-price';
import { dinero, type DineroSnapshot } from 'dinero.js';
import Image from 'next/image';

export const ProductCard = ({ product }: { product: Product }) => {
  const price = dinero(product.price as DineroSnapshot<number>);

  return (
    <div className="group block">
      <div className="space-y-2">
        <div className="relative aspect-square">
          {product.isBestSeller ? (
            <div className="absolute left-2 top-2 z-10 flex">
              <ProductBestSeller />
            </div>
          ) : null}
          <Image
            src={`/${product.image}`}
            fill
            sizes="(min-width: 1184px) 200px, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
            className="rounded-xl grayscale group-hover:opacity-80"
            alt={product.name}
            placeholder="blur"
            blurDataURL={product.imageBlur}
          />
        </div>

        <div className="truncate text-sm font-medium text-white group-hover:text-vercel-cyan">
          {product.name}
        </div>

        {product.rating ? <ProductRating rating={product.rating} /> : null}

        <ProductPrice price={price} discount={product.discount} />

        {product.usedPrice ? (
          <ProductUsedPrice usedPrice={product.usedPrice} />
        ) : null}

        <ProductEstimatedArrival leadTime={product.leadTime} />

        {product.stock <= 1 ? (
          <ProductLowStockWarning stock={product.stock} />
        ) : null}
      </div>
    </div>
  );
};
