export function createRateLimiter(maxConcurrent = 5, delayMs = 50) {
  const queue = [];
  let active = 0;
  let paused = false;

  function processNext() {
    if (paused || active >= maxConcurrent || queue.length === 0) return;

    const { fn, resolve, reject } = queue.shift();
    active++;

    fn()
      .then(resolve)
      .catch((err) => {
        if (err.status === 429) {
          const retryAfter = (err.retryAfter || 2) * 1000;
          paused = true;
          queue.unshift({ fn, resolve, reject });
          active--;
          setTimeout(() => {
            paused = false;
            processNext();
          }, retryAfter);
          return;
        }
        reject(err);
      })
      .finally(() => {
        if (!paused) {
          active--;
          setTimeout(processNext, delayMs);
        }
      });
  }

  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      processNext();
    });
  }

  function flush() {
    queue.length = 0;
  }

  return { enqueue, flush, get pending() { return queue.length + active; } };
}

let defaultLimiter = null;

export function getRateLimiter() {
  if (!defaultLimiter) {
    defaultLimiter = createRateLimiter(5, 50);
  }
  return defaultLimiter;
}
