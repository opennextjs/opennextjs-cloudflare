import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("app-pages-router", { isCI: !!process.env.CI, multipleBrowsers: false });
