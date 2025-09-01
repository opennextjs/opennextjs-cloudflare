---
"@opennextjs/cloudflare": minor
---

Ensure that the initial request.signal is passed to the wrapper

`request.signal.onabort` is now supported in route handlers. It requires that the signal from the original worker's request is passed to the handler. It will then pass along that `AbortSignal` through the `streamCreator` in the wrapper. This signal will destroy the response sent to NextServer when a client aborts, thus triggering the signal in the route handler.

See the changelog in Cloudflare [here](https://developers.cloudflare.com/changelog/2025-05-22-handle-request-cancellation/).

You also need to enable the compatibility flag `enable_request_signal` to use this feature.

**Note:**  
If you have a custom worker, you must update your code to pass the original `request.signal` to the handler. You also need to enable the compatibility flag:
For example:

```js
// Before:
return handler(reqOrResp, env, ctx);

// After:
return handler(reqOrResp, env, ctx, request.signal);
```
