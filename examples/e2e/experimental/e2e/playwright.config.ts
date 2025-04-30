import { configurePlaywright } from "../../../common/config-e2e";

// We need to disable parallel execution for the experimental app, otherwise it breaks the SSR test
export default configurePlaywright("experimental", { parallel: false });
