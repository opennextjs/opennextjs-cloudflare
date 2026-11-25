// The Worker entry point installs the checkpoint listener before the server loads the scheduler.
import { runWithCloudflareRequestContext } from "../init.js";
import { runInSequentialTasks } from "../cache-components-scheduler.js";

async function drainPromiseChain() {
	for (let i = 0; i < 5_000; i++) await null;
}

function recordNativeTimer(order) {
	return new Promise((resolve) => {
		setTimeout(() => {
			order.push("timer");
			resolve();
		}, 0);
	});
}

async function stageOrder() {
	const order = [];
	let timer;
	const scheduleStageWork = (stage) => {
		order.push(stage);
		queueMicrotask(() => process.nextTick(() => order.push(`${stage} tick`)));
		void drainPromiseChain().then(() => {
			order.push(`${stage} promises`);
			setImmediate(() => order.push(`${stage} immediate`));
		});
	};

	await runInSequentialTasks(
		() => {
			timer = recordNativeTimer(order);
			scheduleStageWork("first");
		},
		() => scheduleStageWork("second"),
		() => order.push("last")
	);
	await timer;
	return order;
}

async function repeatedStageOrder() {
	const renders = [];
	for (let i = 0; i < 24; i++) renders.push(await stageOrder());
	return renders;
}

async function immediateOrder() {
	const order = [];
	await runInSequentialTasks(
		() => {
			setImmediate(() => {
				order.push("first immediate");
				void drainPromiseChain().then(() => order.push("first promises"));
			});
			setImmediate(() => order.push("second immediate"));
		},
		() => order.push("next stage")
	);
	return order;
}

async function cancelledImmediates() {
	const order = [];
	await runInSequentialTasks(
		() => {
			clearImmediate(setImmediate(() => order.push("cleared")));
			setImmediate(() => order.push("disposed"))[Symbol.dispose]();
			setImmediate(() => order.push("kept"));
		},
		() => order.push("next stage")
	);
	await recordNativeTimer(order);
	return order;
}

async function boundedStageOrder(ticks) {
	const order = [];
	let timer;
	let promises;
	function queueTick() {
		if (ticks > 0) {
			ticks--;
			queueMicrotask(() => process.nextTick(queueTick));
			return;
		}
		order.push("ticks done");
		promises = drainPromiseChain().then(() => order.push("promises done"));
	}

	await runInSequentialTasks(
		() => {
			timer = recordNativeTimer(order);
			queueTick();
		},
		() => order.push("next stage")
	);
	await Promise.all([timer, promises]);
	return order;
}

async function nestedRejections() {
	const rejections = [];
	const handleRejection = (event) => {
		event.preventDefault();
		rejections.push(String(event.reason));
		if (event.reason === "application rejection") {
			void Promise.reject("nested rejection");
		}
	};
	addEventListener("unhandledrejection", handleRejection);

	try {
		const renders = await Promise.allSettled([
			runInSequentialTasks(
				() => {
					void Promise.reject("application rejection");
					return "first result";
				},
				() => {}
			),
			runInSequentialTasks(
				() => "second result",
				() => {}
			),
		]);
		return {
			rejections,
			renders: renders.map((render) =>
				render.status === "fulfilled" ? render.value : String(render.reason)
			),
		};
	} finally {
		removeEventListener("unhandledrejection", handleRejection);
	}
}

const scenarios = {
	"/stage-order": stageOrder,
	"/repeated-stage-order": repeatedStageOrder,
	"/immediate-order": immediateOrder,
	"/cancelled-immediates": cancelledImmediates,
	"/bounded": () => boundedStageOrder(0),
	"/exhausted": () => boundedStageOrder(80),
	"/nested-rejections": nestedRejections,
};

export default {
	fetch(request, env, ctx) {
		const scenario = scenarios[new URL(request.url).pathname];
		if (!scenario) return new Response(null, { status: 404 });

		return runWithCloudflareRequestContext(request, env, ctx, async () => Response.json(await scenario()));
	},
};
