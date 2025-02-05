import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("api", {
  isCI: !!process.env.CI,
  isWorker: false,
  multipleBrowsers: false,
});
