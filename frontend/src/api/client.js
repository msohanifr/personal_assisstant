// frontend/src/api/client.js
import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

console.debug("[API] Base URL:", API_BASE_URL);

// Create a dedicated axios instance for our app API
const client = axios.create({
  baseURL: API_BASE_URL,
});

// Attach JWT token to every request + log
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access");

    if (token) {
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

// Log responses + handle 401
client.interceptors.response.use(
  (response) => {
    console.debug(
      "[API] Response:",
      response.status,
      response.config?.url
    );
    return response;
  },
  (error) => {
    if (error.response) {
      const { status, data, config } = error.response;
      console.error(
        "[API] Response error:",
        status,
        config?.url,
        data
      );

      if (status === 401 && config?.url !== "/token/") {
        // Only auto-clear tokens for non-login 401s
        console.warn(
          "[API] 401 Unauthorized on protected endpoint – clearing tokens"
        );
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
      }
    } else {
      console.error("[API] Network or CORS error:", error.message || error);
    }

    return Promise.reject(error);
  }
);

export default client;