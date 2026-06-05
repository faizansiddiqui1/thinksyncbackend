import axios from "axios";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(error, attempt) {
  const retryAfter = error?.response?.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 5000);
}

function shouldRetry(error) {
  const status = error?.response?.status;
  return status === 429 || (status >= 500 && status < 600);
}

export async function graphRequest({
  method = "GET",
  url,
  accessToken,
  data,
  headers = {},
}) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios({
        method,
        url: url.startsWith("http") ? url : `${GRAPH_BASE_URL}${url}`,
        data,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...headers,
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === MAX_RETRIES - 1) break;
      await sleep(getRetryDelay(error, attempt));
    }
  }

  throw lastError;
}

export function getMe(accessToken) {
  return graphRequest({ url: "/me", accessToken });
}

export function createCalendarEvent(accessToken, event) {
  return graphRequest({
    method: "POST",
    url: "/me/events",
    accessToken,
    data: event,
  });
}

export function updateCalendarEvent(accessToken, eventId, event) {
  return graphRequest({
    method: "PATCH",
    url: `/me/events/${encodeURIComponent(eventId)}`,
    accessToken,
    data: event,
  });
}

export async function deleteCalendarEvent(accessToken, eventId) {
  try {
    await graphRequest({
      method: "DELETE",
      url: `/me/events/${encodeURIComponent(eventId)}`,
      accessToken,
    });
    return true;
  } catch (error) {
    if (error?.response?.status === 404) return true;
    throw error;
  }
}
