import { configurePlaywright } from "../../../common/config-e2e";

export default configurePlaywright("gh-223", { isCI: !!process.env.CI });
