import { configurePlaywright } from "../../../common/config-e2e";

// Here we don't want to run the tests in parallel
export default configurePlaywright("memory-queue", {
  isCI: !!process.env.CI,
  parallel: false,
  multipleBrowsers: false,
});
