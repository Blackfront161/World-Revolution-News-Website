/* Testable bounded, rate-limited queue for website translation jobs. */
'use strict';

((scope) => {
  class TranslationQueue {
    constructor({
      concurrency = 2,
      retries = 1,
      minIntervalMs = 450,
      backoffBaseMs = 900,
      backoffMaxMs = 8000,
      jitterRatio = 0.2,
      now = () => Date.now(),
      random = () => Math.random(),
      setTimer = (callback, ms) => setTimeout(callback, ms),
      clearTimer = handle => clearTimeout(handle)
    } = {}) {
      this.concurrency = Math.max(1, Number(concurrency) || 1);
      this.retries = Math.max(0, Number(retries) || 0);
      this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
      this.backoffBaseMs = Math.max(0, Number(backoffBaseMs) || 0);
      this.backoffMaxMs = Math.max(this.backoffBaseMs, Number(backoffMaxMs) || 0);
      this.jitterRatio = Math.min(1, Math.max(0, Number(jitterRatio) || 0));
      this.now = now;
      this.random = random;
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.pending = [];
      this.active = new Map();
      this.seen = new Set();
      this.generation = 0;
      this.runSequence = 0;
      this.nextStartAt = 0;
    }

    add(key, task, options = {}) {
      if (!key || typeof task !== 'function' || this.seen.has(key)) return false;
      if (options.cacheHit === true) {
        options.onCacheHit?.();
        return false;
      }
      this.seen.add(key);
      this.pending.push({ key, task, attempt: 0, generation: this.generation, options });
      this.pump();
      return true;
    }

    cancel() {
      this.generation += 1;
      this.pending.length = 0;
      this.seen.clear();
      this.nextStartAt = this.now();
      this.active.forEach(controller => controller.abort());
    }

    wait(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        let timer = null;
        const cleanup = () => signal.removeEventListener('abort', onAbort);
        const onAbort = () => {
          if (timer !== null) this.clearTimer(timer);
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        timer = this.setTimer(() => {
          cleanup();
          resolve();
        }, Math.max(0, ms));
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }

    async rateGate(signal) {
      const startAt = Math.max(this.now(), this.nextStartAt);
      this.nextStartAt = startAt + this.minIntervalMs;
      await this.wait(startAt - this.now(), signal);
    }

    retryDelay(attempt) {
      const exponential = Math.min(
        this.backoffMaxMs,
        this.backoffBaseMs * (2 ** Math.max(0, attempt))
      );
      const jitter = exponential * this.jitterRatio * ((this.random() * 2) - 1);
      return Math.max(0, Math.round(exponential + jitter));
    }

    async run(item) {
      const controller = new AbortController();
      const activeKey = `${item.generation}:${++this.runSequence}:${item.key}`;
      this.active.set(activeKey, controller);
      try {
        await this.rateGate(controller.signal);
        await item.task(controller.signal, item.attempt);
        item.options.onSuccess?.();
      } catch (error) {
        const isAbortError = error?.name === 'AbortError';
        const canRetry = !isAbortError
          && !controller.signal.aborted
          && item.attempt < this.retries
          && item.generation === this.generation;
        if (canRetry) {
          try {
            await this.wait(this.retryDelay(item.attempt), controller.signal);
            if (!controller.signal.aborted && item.generation === this.generation) {
              this.pending.push({ ...item, attempt: item.attempt + 1 });
            }
          } catch (waitError) {
            if (waitError?.name !== 'AbortError') item.options.onError?.(waitError);
          }
        } else if (!controller.signal.aborted && !isAbortError) {
          item.options.onError?.(error);
        }
      } finally {
        this.active.delete(activeKey);
        this.pump();
      }
    }

    pump() {
      while (this.active.size < this.concurrency && this.pending.length) {
        const item = this.pending.shift();
        if (item.generation === this.generation) void this.run(item);
      }
    }
  }

  scope.WRNWebsiteTranslationQueue = TranslationQueue;
})(typeof window !== 'undefined' ? window : globalThis);
