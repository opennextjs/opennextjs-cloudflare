'use client';

import { NextLogo } from '#/components/next-logo';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';

import clsx from 'clsx';
import { useState } from 'react';
import Byline from '#/components/byline';
import {
  delayRecommendedProducts,
  delayReviews,
  delayShippingEstimate,
} from '#/lib/delay';

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-0 z-20 flex w-full flex-col border-b border-gray-800 bg-black lg:bottom-0 lg:z-auto lg:w-72 lg:border-b-0 lg:border-r lg:border-gray-800">
      <div className="flex h-14 items-center px-4 py-4 lg:h-auto">
        <div className="group flex w-full items-center gap-x-2.5">
          <div className="h-7 w-7 rounded-full border border-white/30">
            <NextLogo />
          </div>

          <h3 className="font-semibold tracking-wide text-gray-400">
            Partial Prerendering
          </h3>
        </div>
      </div>
      <button
        type="button"
        className="group absolute right-0 top-0 flex h-14 items-center gap-x-2 px-4 lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="font-medium text-gray-100 group-hover:text-gray-400">
          Menu
        </div>
        {isOpen ? (
          <XMarkIcon className="block w-6 text-gray-400" />
        ) : (
          <Bars3Icon className="block w-6 text-gray-400" />
        )}
      </button>

      <div
        className={clsx('overflow-y-auto lg:static lg:block', {
          'fixed inset-x-0 bottom-0 top-14 mt-px bg-black': isOpen,
          hidden: !isOpen,
        })}
      >
        <div className="prose prose-sm prose-invert max-w-none space-y-6 px-4 pb-20 text-gray-300">
          <div className="text-gray-400">
            <p>
              <span className="font-bold text-vercel-pink">Pink dots</span>{' '}
              denote artificially delayed responses for demo purposes:
            </p>
            <ul>
              <li>Shipping estimate → {delayShippingEstimate}ms</li>
              <li>Recommended products → {delayRecommendedProducts}ms</li>
              <li>Reviews → {delayReviews}ms</li>
            </ul>
          </div>

          <p>
            <a
              target="_blank"
              href="https://vercel.com/blog/partial-prerendering-with-next-js-creating-a-new-default-rendering-model"
            >
              Partial Prerendering
            </a>{' '}
            combines ultra-quick static edge delivery with fully dynamic
            capabilities. This is different from how your application behaves
            today, where entire routes are either fully static or dynamic.
          </p>
          <p>How it works:</p>
          <ul>
            <li>
              A static route <em>shell</em> is served immediately, this makes
              the initial load fast.
            </li>
            <li>
              The shell leaves <em>holes</em> where dynamic content (that might
              be slower) will be streamed in to minimize the perceived overall
              page load time.
            </li>
            <li>
              The async holes are loaded in parallel, reducing the overall load
              time of the page.
            </li>
          </ul>
          <p className="text-gray-400">
            Try refreshing the page to restart the demo.
          </p>
        </div>
        <Byline className="absolute hidden sm:block" />
      </div>
    </div>
  );
}
