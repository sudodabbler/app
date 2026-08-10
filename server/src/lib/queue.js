import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';

/**
 * Minimal in-process job queue. Serial by default (one worker) which is the
 * safe choice for ffmpeg — renders are CPU-bound and concurrency just thrashes.
 * Swappable for BullMQ later: same enqueue/get surface, jobs carry a `type`.
 *
 * A job:
 *   { id, type, status: 'queued'|'running'|'done'|'failed',
 *     progress: 0..100, message, result, error, createdAt, updatedAt }
 */
class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.handlers = new Map();
    this.pending = [];
    this.running = false;
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  enqueue(type, payload) {
    const job = {
      id: nanoid(12),
      type,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      payload,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    this._drain();
    return this._public(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? this._public(job) : null;
  }

  _update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.emit('update', this._public(job));
  }

  _public(job) {
    // Hide the raw payload from API consumers.
    const { payload, ...rest } = job;
    return { ...rest };
  }

  async _drain() {
    if (this.running) return;
    this.running = true;
    while (this.pending.length > 0) {
      const id = this.pending.shift();
      const job = this.jobs.get(id);
      if (!job) continue;
      const handler = this.handlers.get(job.type);
      if (!handler) {
        this._update(job, { status: 'failed', error: `No handler for job type "${job.type}"` });
        continue;
      }
      this._update(job, { status: 'running', message: 'Starting', progress: 1 });
      const ctx = {
        setProgress: (progress, message) =>
          this._update(job, {
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            ...(message ? { message } : {}),
          }),
      };
      try {
        const result = await handler(job.payload, ctx);
        this._update(job, { status: 'done', progress: 100, message: 'Complete', result });
      } catch (err) {
        this._update(job, {
          status: 'failed',
          message: 'Failed',
          error: err?.message || String(err),
        });
      }
    }
    this.running = false;
  }
}

export const queue = new JobQueue();
