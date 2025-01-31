import { VercelLogo } from '#/components/vercel-logo';

export default function Byline({ className }: { className: string }) {
  return (
    <div
      className={`${className} inset-x-0 bottom-3 mx-3 rounded-lg bg-vc-border-gradient p-px shadow-lg shadow-black/20`}
    >
      <div className="flex flex-row justify-between rounded-lg bg-black p-3.5 lg:px-5 lg:py-3">
        <div className="flex items-center gap-x-1.5">
          <div className="text-sm text-gray-400">By</div>
          <a href="https://vercel.com" title="Vercel">
            <div className="w-16 text-gray-100 hover:text-gray-50">
              <VercelLogo />
            </div>
          </a>
        </div>

        <div className="text-sm text-gray-400">
          <a
            className="underline decoration-dotted underline-offset-4 transition-colors hover:text-gray-300"
            href="https://github.com/vercel-labs/next-partial-prerendering"
            target="_blank"
            rel="noreferrer"
          >
            View code
          </a>
        </div>
      </div>
    </div>
  );
}
