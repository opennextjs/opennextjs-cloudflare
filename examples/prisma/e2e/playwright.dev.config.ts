import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("prisma", {
  isCI: !!process.env.CI,
  isWorker: false,
});
