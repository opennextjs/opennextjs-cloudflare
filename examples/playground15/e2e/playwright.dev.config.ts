import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("playground15", {
  isCI: !!process.env.CI,
  isWorker: false,
});
