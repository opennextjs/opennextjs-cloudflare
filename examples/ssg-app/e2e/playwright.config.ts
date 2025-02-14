import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("ssg-app", { isCI: !!process.env.CI, multipleBrowsers: false });
