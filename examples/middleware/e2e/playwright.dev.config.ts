import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("middleware", {
  isCI: !!process.env.CI,
  isWorker: false,
  multipleBrowsers: false,
});
