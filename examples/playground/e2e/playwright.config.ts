import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("playground", { isCI: !!process.env.CI });
