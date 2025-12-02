// frontend/src/api/client.js
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8001/api";

console.debug("[API] Base URL:", API_BASE_URL);

// ---- small helper so we can reuse logout logic ----
function logoutFrontend() {
  console.warn("[API] Logging out frontend (clearing tokens + redirect)");
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");

  // Hard redirect so all React state resets
  if (typeof window !== "undefined") {
    if (window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
  }
}

// Create a dedicated axios instance for our app API
const client = axios.create({
  baseURL: API_BASE_URL,
});

// -------- REQUEST INTERCEPTOR: attach token --------
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access");

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      console.debug(
        "[API] Request:",
        (config.method || "GET").toUpperCase(),
        config.url,
        "with Bearer token"
      );
    } else {
      console.warn(
        "[API] Request WITHOUT token:",
        (config.method || "GET").toUpperCase(),
        config.url
      );
    }

    return config;
  },
  (error) => {
    console.error("[API] Error in request interceptor:", error);
    return Promise.reject(error);
  }
);

// -------- RESPONSE INTERCEPTOR: refresh or logout --------

// we need a simple queue so multiple 401s during one refresh don't trigger many refresh calls
let isRefreshing = false;
let refreshQueue = [];

/**
 * Resolve/reject all queued requests waiting for token refresh.
 */
function processRefreshQueue(error, newToken = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(newToken);
  });
  refreshQueue = [];
}

client.interceptors.response.use(
  (response) => {
    console.debug(
      "[API] Response:",
      response.status,
      response.config?.url
    );
    return response;
  },
  async (error) => {
    if (!error.response) {
      console.error("[API] Network or CORS error:", error.message || error);
      return Promise.reject(error);
    }

    const { status, data, config } = error.response;
    const originalRequest = config;

    console.error(
      "[API] Response error:",
      status,
      config?.url,
      data
    );

    // If 401 on the login endpoint itself, just bubble up
    if (status === 401 && originalRequest?.url === "/token/") {
      return Promise.reject(error);
    }

    // Handle 401 globally (refresh token flow)
    if (status === 401) {
      const refreshToken = localStorage.getItem("refresh");

      // No refresh token -> we can't recover, logout user.
      if (!refreshToken) {
        console.warn("[API] 401 and no refresh token present – logging out.");
        logoutFrontend();
        return Promise.reject(error);
      }

      // Avoid infinite loop on refresh endpoint itself
      if (originalRequest._retry) {
        console.warn("[API] 401 on retried request – logging out.");
        logoutFrontend();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If we are already refreshing, queue this request until refresh completes
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (newToken) => {
              // update Authorization header with new token
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(client(originalRequest));
            },
            reject,
          });
        });
      }

      // Start a new refresh
      isRefreshing = true;

      try {
        console.debug("[API] Attempting token refresh…");
        // Use plain axios here to avoid recursion via client interceptors
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/token/refresh/`,
          { refresh: refreshToken }
        );

        const newAccess = refreshResponse.data?.access;
        if (!newAccess) {
          throw new Error("No access token returned from refresh endpoint");
        }

        // Store and attach new token
        localStorage.setItem("access", newAccess);
        client.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
        console.debug("[API] Token refresh successful, retrying queued requests.");

        processRefreshQueue(null, newAccess);
        isRefreshing = false;

        // Retry the original request with the new token
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return client(originalRequest);
      } catch (refreshError) {
        console.error("[API] Token refresh failed:", refreshError);
        processRefreshQueue(refreshError, null);
        isRefreshing = false;

        // Refresh failed -> logout user completely
        logoutFrontend();
        return Promise.reject(refreshError);
      }
    }

    // Non-401 errors: just forward
    return Promise.reject(error);
  }
);

export default client;