// Wrapper around client.js to cache creates when offline and replay them.
import client from "./client";
import { enqueue, getQueue, clearQueue } from "./offlineQueue";

async function replayQueue() {
  const queue = getQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const op of queue) {
    try {
      if (op.type === "create-task") {
        await client.post("/tasks/", op.payload);
      } else {
        // Unsupported op, keep it
        remaining.push(op);
      }
    } catch (err) {
      console.error("[offlineClient] Failed to replay op", op, err);
      remaining.push(op);
    }
  }

  if (remaining.length) {
    localStorage.setItem(
      "assistant_offline_queue_v1",
      JSON.stringify(remaining)
    );
  } else {
    clearQueue();
  }
}

export async function createTask(payload) {
  if (!navigator.onLine) {
    enqueue({ type: "create-task", payload });
    return { offline: true };
  }
  try {
    const res = await client.post("/tasks/", payload);
    return res;
  } catch (err) {
    if (err.message && err.message.includes("Network Error")) {
      enqueue({ type: "create-task", payload });
      return { offline: true };
    }
    throw err;
  }
}

// Attempt to replay when coming online
window.addEventListener("online", () => {
  replayQueue();
});

export async function flushOfflineQueue() {
  if (navigator.onLine) {
    await replayQueue();
  }
}
