import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("playground14", { isCI: !!process.env.CI });
