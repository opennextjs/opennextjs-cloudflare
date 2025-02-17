import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("create-next-app", { isCI: !!process.env.CI, multipleBrowsers: true });
