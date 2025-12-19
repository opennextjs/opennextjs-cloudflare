import { configurePlaywright } from "../../../common/config-e2e";

// Here we don't want to run the tests in parallel
export default configurePlaywright("memory-queue", {
	parallel: false,
	multipleBrowsers: false,
});
