import { issuer } from "@openauthjs/openauth";
import { biProxy } from "./services/mireBi";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { listOrders, getOrder, upsertOrder, deleteOrder, bulkUpsert } from "./services/orders";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // This top section is just for demo purposes. In a real setup another
    // application would redirect the user to this Worker to be authenticated,
    // and after signing in or registering the user would be redirected back to
    // the application they came from. In our demo setup there is no other
    // application, so this Worker needs to do the initial redirect and handle
    // the callback redirect on completion.
    const url = new URL(request.url);
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/dashboard");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    } else if (url.pathname === "/callback") {
      return Response.json({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      });
    } else if (url.pathname === "/dashboard") {
      return new Response(renderDashboardHtml(url.origin), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } else if (url.pathname === "/bi" || url.pathname.startsWith("/bi/")) {
      // Proxy BI requests to external MIRE API with configured auth
      return biProxy(request, env);
    } else if (url.pathname === "/orders" && request.method === "GET") {
      return listOrders(env, url.searchParams);
    } else if (url.pathname === "/orders" && request.method === "POST") {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        if (Array.isArray(body)) {
          return bulkUpsert(env, body);
        }
        return upsertOrder(env, body);
      }
      return new Response(JSON.stringify({ error: 'Content-Type application/json requerido' }), { status: 400, headers: { 'content-type': 'application/json' }});
    } else if (url.pathname.startsWith("/orders/") && request.method === "GET") {
      const idStr = url.pathname.split('/')[2];
      const id = Number(idStr);
      if (!id || Number.isNaN(id)) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400, headers: { 'content-type': 'application/json' }});
      return getOrder(env, id);
    } else if (url.pathname.startsWith("/orders/") && request.method === "DELETE") {
      const idStr = url.pathname.split('/')[2];
      const id = Number(idStr);
      if (!id || Number.isNaN(id)) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400, headers: { 'content-type': 'application/json' }});
      return deleteOrder(env, id);
    }
    // The real OpenAuth server code starts here:
    return issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            // eslint-disable-next-line @typescript-eslint/require-await
            sendCode: async (email, code) => {
              // This is where you would email the verification code to the
              // user, e.g. using Resend:
              // https://resend.com/docs/send-with-cloudflare-workers
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
            },
          }),
        ),
      },
      theme: {
        title: "myAuth",
        primary: "#0051c3",
        favicon: "https://workers.cloudflare.com//favicon.ico",
        logo: {
          dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
          light:
            "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
        },
      },
      success: async (ctx, value) => {
        return ctx.subject("user", {
          id: await getOrCreateUser(env, value.email),
        });
      },
    }).fetch(request, env, ctx);
  }
};

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }
  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}

function renderDashboardHtml(origin: string): string {
  return `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard de Vendas</title>
    <style>
      :root { --primary: #0051c3; --bg: #0f172a; --card: #111827; --text: #e5e7eb; }
      body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
      header { padding: 16px 24px; background: var(--card); border-bottom: 1px solid #1f2937; }
      h1 { margin: 0; font-size: 20px; }
      main { padding: 24px; }
      .controls { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; margin-bottom: 16px; }
      .control { display: flex; flex-direction: column; gap: 6px; }
      input, button { padding: 8px 10px; border-radius: 6px; border: 1px solid #374151; background: #0b1220; color: var(--text); }
      button { background: var(--primary); border-color: var(--primary); cursor: pointer; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
      @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
      .card { background: var(--card); border: 1px solid #1f2937; border-radius: 8px; padding: 16px; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .summary .item { background: #0b1220; padding: 12px; border-radius: 6px; border: 1px solid #1f2937; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px; border-bottom: 1px solid #1f2937; text-align: left; }
      th { background: #0b1220; }
      pre { white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <header>
      <h1>Dashboard de Vendas</h1>
    </header>
    <main>
      <div class="controls">
        <div class="control">
          <label for="start">Início</label>
          <input id="start" type="date" />
        </div>
        <div class="control">
          <label for="end">Fim</label>
          <input id="end" type="date" />
        </div>
        <div class="control">
          <button id="load">Carregar</button>
        </div>
      </div>
      <div class="grid">
        <section class="card">
          <h2>Resumo</h2>
          <div id="summary" class="summary">
            <div class="item"><strong>Total</strong><div id="total">–</div></div>
            <div class="item"><strong>Pedidos</strong><div id="orders">–</div></div>
            <div class="item"><strong>Média</strong><div id="avg">–</div></div>
          </div>
        </section>
        <section class="card">
          <h2>Dados</h2>
          <div id="tableWrap"></div>
        </section>
        <section class="card" style="grid-column: 1 / -1;">
          <h2>Resposta (JSON)</h2>
          <pre id="raw">Aguardando...</pre>
        </section>
      </div>
    </main>
    <script>
      const startEl = document.getElementById('start');
      const endEl = document.getElementById('end');
      const loadBtn = document.getElementById('load');
      const rawEl = document.getElementById('raw');
      const tableWrap = document.getElementById('tableWrap');
      const totalEl = document.getElementById('total');
      const ordersEl = document.getElementById('orders');
      const avgEl = document.getElementById('avg');

      function fmtDate(d) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return y + '-' + m + '-' + day; }
      function setDefaults() {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 14);
        startEl.value = fmtDate(start);
        endEl.value = fmtDate(end);
      }

      async function fetchData() {
        const startdate = startEl.value; const enddate = endEl.value;
        if (!startdate || !enddate) { alert('Selecione as datas.'); return; }
        const res = await fetch('/bi?startdate=' + encodeURIComponent(startdate) + '&enddate=' + encodeURIComponent(enddate), { headers: { 'Accept': 'application/json' } });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        rawEl.textContent = typeof data === 'string' ? text : JSON.stringify(data, null, 2);
        renderData(data);
      }

      function renderData(data) {
        // Reset
        tableWrap.innerHTML = '';
        totalEl.textContent = '–'; ordersEl.textContent = '–'; avgEl.textContent = '–';
        // Normalize array
        let rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : null);
        if (!rows) { return; }
        const candidates = ['total','amount','valor','value','price'];
        let total = 0; let count = rows.length; let foundKey = null;
        for (const r of rows) {
          for (const k of candidates) {
            const v = r[k];
            if (typeof v === 'number') { total += v; foundKey = foundKey || k; break; }
            if (typeof v === 'string' && v && !isNaN(Number(v))) { total += Number(v); foundKey = foundKey || k; break; }
          }
        }
        totalEl.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        ordersEl.textContent = String(count);
        avgEl.textContent = count ? (total / count).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–';

        // Build table
        const cols = [...rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set())];
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        for (const c of cols) { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); }
        thead.appendChild(trh); table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const r of rows) {
          const tr = document.createElement('tr');
          for (const c of cols) { const td = document.createElement('td'); let v = r[c]; td.textContent = v == null ? '' : String(v); tr.appendChild(td); }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tableWrap.appendChild(table);
      }

      loadBtn.addEventListener('click', fetchData);
      setDefaults();
      fetchData();
    </script>
  </body>
</html>`;
}
