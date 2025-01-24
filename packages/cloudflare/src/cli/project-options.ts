export type ProjectOptions = {
  // Next app root folder
  sourceDir: string;
  // The directory to save the output to (defaults to the app's directory)
  outputDir: string;
  // Whether the Next.js build should be skipped (i.e. if the `.next` dir is already built)
  skipNextBuild: boolean;
  // Whether the check to see if a wrangler config file exists should be skipped
  skipWranglerConfigCheck: boolean;
  // Whether minification of the worker should be enabled
  minify: boolean;
};
