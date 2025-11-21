import { configurePlaywright } from "../../common/config-e2e";

export default configurePlaywright("middleware", {
	isWorker: false,
});
