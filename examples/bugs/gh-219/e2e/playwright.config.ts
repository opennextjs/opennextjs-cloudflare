import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("gh-219", { isCI: !!process.env.CI, multipleBrowsers: false });
