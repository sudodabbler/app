import { spawn } from 'node:child_process';

/**
 * Run a command, resolving with { code, stdout, stderr }.
 * Never rejects on a non-zero exit; callers decide what to do with `code`.
 * Rejects only when the binary cannot be spawned at all (ENOENT etc.).
 */
export function run(bin, args, { cwd, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { cwd });
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onStderr) onStderr(s);
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Like run(), but rejects with a helpful error when the command exits non-zero.
 */
export async function runOrThrow(bin, args, opts) {
  const res = await run(bin, args, opts);
  if (res.code !== 0) {
    const tail = res.stderr.split('\n').slice(-15).join('\n');
    const err = new Error(`${bin} exited ${res.code}\n${tail}`);
    err.code = res.code;
    err.stderr = res.stderr;
    throw err;
  }
  return res;
}

const availabilityCache = new Map();

/**
 * Cheap check that a binary exists and can be spawned. Cached per process.
 * Exit code is irrelevant — some tools return non-zero for --version. What
 * matters is whether the OS could launch it (ENOENT => not installed).
 */
export async function isAvailable(bin, versionArg = '-version') {
  if (availabilityCache.has(bin)) return availabilityCache.get(bin);
  let ok = false;
  try {
    await run(bin, [versionArg]);
    ok = true;
  } catch {
    ok = false;
  }
  availabilityCache.set(bin, ok);
  return ok;
}
