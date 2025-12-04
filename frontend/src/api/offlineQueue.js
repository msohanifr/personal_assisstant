const STORAGE_KEY = "assistant_offline_queue_v1";

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function enqueue(operation) {
  const queue = loadQueue();
  queue.push({
    ...operation,
    enqueuedAt: Date.now(),
  });
  saveQueue(queue);
}

export function clearQueue() {
  saveQueue([]);
}

export function getQueue() {
  return loadQueue();
}
