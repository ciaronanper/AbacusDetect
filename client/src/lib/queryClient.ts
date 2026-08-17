import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiUrl } from "./apiBase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (text.trimStart().startsWith("<")) {
      // An HTML page came back instead of data — the request never reached
      // the API (wrong/missing server address or the SPA fallback answered).
      throw new Error(
        "Could not reach the AbacusDetect server. Check your internet connection and try again.",
      );
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Guards against a 200 response that is actually an HTML page (e.g. the
 * packaged app hitting its own bundled files instead of the server, or a
 * captive-portal network). Throws a plain-English error instead of letting
 * JSON.parse fail with "Unexpected token '<'".
 */
function throwIfNotJson(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new Error(
      "Could not reach the AbacusDetect server. Check your internet connection and try again.",
    );
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  throwIfNotJson(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(apiUrl(queryKey.join("/") as string), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    throwIfNotJson(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
