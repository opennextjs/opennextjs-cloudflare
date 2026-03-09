/**
 * Shared types and error codes for the R2 cache worker and its caller.
 */

/** The R2 bucket binding is not configured in the worker environment. */
export const ERR_BINDING_NOT_FOUND = "ERR_BINDING_NOT_FOUND";
/** The request body is not valid FormData or is missing required fields. */
export const ERR_INVALID_REQUEST = "ERR_INVALID_REQUEST";
/** The R2 put operation failed. */
export const ERR_WRITE_FAILED = "ERR_WRITE_FAILED";

export type ErrorCode = typeof ERR_BINDING_NOT_FOUND | typeof ERR_INVALID_REQUEST | typeof ERR_WRITE_FAILED;

/** Successful response from the worker. */
export interface R2SuccessResponse {
	success: true;
}

/** Error response from the worker, includes an error message and a typed code. */
export interface R2ErrorResponse {
	success: false;
	error: string;
	code: ErrorCode;
}

/** Union of all possible responses from the worker. */
export type R2Response = R2SuccessResponse | R2ErrorResponse;

export interface CachePopulateEnv {
	R2?: R2Bucket;
}
