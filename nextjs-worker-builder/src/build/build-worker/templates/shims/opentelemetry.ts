export function createContextKey() {
	return "";
}

export const context = {
	active() {
		return {};
	},
	with() {
		return null;
	},
};

export const trace = {
	getSpanContext() {
		return null;
	},
};

export const propagation = {
	extract() {
		return context;
	},
};
