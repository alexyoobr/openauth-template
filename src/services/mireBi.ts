export function buildMireUrl(env: Env, upstreamPath: string, incomingQuery: URLSearchParams): string {
  const base = env.MIRE_API_URL.replace(/\/$/, "");
  const path = (upstreamPath || "").replace(/^\//, "");
  const url = new URL(base + (path ? "/" + path : ""));
  // Forward all query params except internal ones
  for (const [k, v] of incomingQuery.entries()) {
    if (k !== "path") url.searchParams.set(k, v);
  }
  return url.toString();
}

function buildAuthHeaders(env: Env): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  // Require Basic auth
  if (!env.MIRE_API_USERNAME || !env.MIRE_API_PASSWORD) {
    throw new Error("Credenciais Basic (username/password) não configuradas");
  }
  const token = btoa(`${env.MIRE_API_USERNAME}:${env.MIRE_API_PASSWORD}`);
  headers.set("Authorization", `Basic ${token}`);
  // API key must be provided via 'apikey' header
  if (!env.MIRE_API_KEY) {
    throw new Error("API key não configurada");
  }
  headers.set("apikey", env.MIRE_API_KEY);
  return headers;
}

export async function biProxy(request: Request, env: Env): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamPath = incomingUrl.pathname.startsWith("/bi/")
    ? incomingUrl.pathname.slice("/bi/".length)
    : incomingUrl.searchParams.get("path") || "";

  // Ensure required params: startdate and enddate
  let startdate = incomingUrl.searchParams.get("startdate") || undefined;
  let enddate = incomingUrl.searchParams.get("enddate") || undefined;

  let bodyText: string | undefined;
  let bodyJson: any | undefined;
  if (request.method !== "GET") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      bodyText = await request.text();
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        // ignore parse errors; we'll still forward raw body
      }
      if (!startdate && bodyJson?.startdate) startdate = String(bodyJson.startdate);
      if (!enddate && bodyJson?.enddate) enddate = String(bodyJson.enddate);
    }
  }

  if (!startdate || !enddate) {
    return Response.json(
      {
        error: "Parâmetros obrigatórios ausentes",
        required: ["startdate", "enddate"],
        example:
          "curl --location 'https://mire.omnni.com.br/api/bi?startdate=YYYY-MM-DD&enddate=YYYY-MM-DD' --header 'apikey: <KEY>' --header 'Authorization: Basic <BASE64>'",
      },
      { status: 400 },
    );
  }

  // Put params into the upstream query
  incomingUrl.searchParams.set("startdate", startdate);
  incomingUrl.searchParams.set("enddate", enddate);

  const targetUrl = buildMireUrl(env, upstreamPath, incomingUrl.searchParams);
  const headers = buildAuthHeaders(env);

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (bodyText) {
    init.body = bodyText;
    headers.set("content-type", "application/json");
  }

  try {
    const resp = await fetch(targetUrl, init);
    const contentType = resp.headers.get("content-type") || "application/json";
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    return Response.json(
      { error: "Erro ao consultar o endpoint MIRE", details: String(err) },
      { status: 502 },
    );
  }
}