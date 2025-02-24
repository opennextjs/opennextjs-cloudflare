import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("instrumentation-app", { isCI: !!process.env.CI });
