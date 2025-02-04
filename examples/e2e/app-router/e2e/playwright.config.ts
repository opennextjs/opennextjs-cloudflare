import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("app-router", {
  testDir: "./only",
  isCI: !!process.env.CI,
  multipleBrowsers: false,
});
