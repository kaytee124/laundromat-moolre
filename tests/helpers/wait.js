/**
 * Wait until `fn` returns truthy or throws nothing when used as assertion callback.
 * @param {() => unknown} fn
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
async function waitFor(fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 25;
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value !== false && value !== undefined) return value;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (lastErr) throw lastErr;
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function waitForSms(sendSmsSpy, opts) {
  await waitFor(() => {
    expect(sendSmsSpy).toHaveBeenCalled();
    return true;
  }, opts);
}

module.exports = { waitFor, waitForSms };
