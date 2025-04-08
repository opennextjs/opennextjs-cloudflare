import { configurePlaywright } from "../../../common/config-e2e";

// Here we don't want to run the tests in parallel
export default configurePlaywright("static-assets-incremental-cache", {
  isCI: !!process.env.CI,
  parallel: false,
});
