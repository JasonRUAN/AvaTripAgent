export type AgentHealth =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ok";
      service: string;
      address: string;
      categories: string[];
      chain: boolean;
    }
  | { status: "error"; message: string };

export function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export async function probeAgentHealth(endpoint: string): Promise<AgentHealth> {
  const base = normalizeEndpoint(endpoint);
  if (!base) return { status: "error", message: "请先填写 API 地址" };
  if (!isHttpUrl(base)) return { status: "error", message: "地址需以 http:// 或 https:// 开头" };

  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };
    const data = (await response.json()) as {
      ok?: boolean;
      service?: string;
      address?: string;
      categories?: string[];
      category?: string;
      chain?: boolean;
    };
    if (!data.ok) return { status: "error", message: "health 返回 ok=false" };
    return {
      status: "ok",
      service: data.service ?? "unknown",
      address: data.address ?? "",
      categories: data.categories ?? (data.category ? [data.category] : []),
      chain: Boolean(data.chain),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "探测失败";
    if (/abort|timeout/i.test(message)) return { status: "error", message: "超时（5s）" };
    return { status: "error", message: "无法连接，请确认服务已启动且允许跨域" };
  }
}
