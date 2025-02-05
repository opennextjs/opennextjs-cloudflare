import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("gh-119", { isCI: !!process.env.CI, multipleBrowsers: false });
