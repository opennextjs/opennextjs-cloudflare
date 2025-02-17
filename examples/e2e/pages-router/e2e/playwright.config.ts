import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("pages-router", { isCI: !!process.env.CI });
