// A device-local focus clock. Deadlines keep time through sleep and reloads.
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 60;
export function freshTimer(taskId = null, minutes = 25) {
  return { taskId, minutes, remainingMs: minutes * 60000, endAt: null, status: 'ready' };
}
export function readTimer(value) {
  if (!value || (value.taskId !== null && typeof value.taskId !== 'string') ||
      !Number.isInteger(value.minutes) || value.minutes < 5 || value.minutes > 60 || value.minutes % 5 ||
      !Number.isFinite(value.remainingMs) || value.remainingMs < 0 || value.remainingMs > value.minutes * 60000 ||
      !['ready', 'running', 'paused', 'finished'].includes(value.status) ||
      (value.status === 'running' ? !Number.isFinite(value.endAt) || value.endAt <= 0 || !value.taskId : value.endAt !== null) ||
      (value.status === 'finished' && value.remainingMs !== 0)) return freshTimer();
  return { taskId: value.taskId, minutes: value.minutes, remainingMs: value.remainingMs, endAt: value.endAt, status: value.status };
}
export function remaining(timer, now = Date.now()) {
  return timer.status === 'running' ? Math.max(0, Math.min(timer.minutes * 60000, timer.endAt - now)) : timer.remainingMs;
}
export function startTimer(timer, now = Date.now()) {
  if (!timer.taskId || timer.status === 'running') return timer;
  const ms = timer.status === 'finished' ? timer.minutes * 60000 : timer.remainingMs;
  return { ...timer, remainingMs: ms, endAt: now + ms, status: 'running' };
}
export function pauseTimer(timer, now = Date.now()) {
  if (timer.status !== 'running') return timer;
  const ms = remaining(timer, now);
  return { ...timer, remainingMs: ms, endAt: null, status: ms ? 'paused' : 'finished' };
}
export function finishTimer(timer, now = Date.now()) {
  return timer.status === 'running' && remaining(timer, now) === 0
    ? { ...timer, remainingMs: 0, endAt: null, status: 'finished' } : timer;
}
export function durationTimer(timer, minutes) {
  if (timer.status === 'running' || !Number.isFinite(minutes)) return timer;
  return freshTimer(timer.taskId, Math.max(5, Math.min(60, Math.round(minutes / 5) * 5)));
}
