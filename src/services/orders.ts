export type OrderRecord = {
  id?: number;
  companyId: string;
  produced: number;
  storeId: number;
  orderId: number;
  skuId: string;
  productId?: string | null;
  category?: string | null;
  model?: string | null;
  cost?: number | null;
  subcategory?: string | null;
  brand?: string | null;
  collection?: string | null;
  quantity?: number | null;
  salePrice?: number | null;
  discount?: number | null;
  total?: number | null;
  description?: string | null;
  color?: string | null;
  size?: string | null;
  transactionCode?: string | null;
  customerName?: string | null;
  payment?: string | null;
  saleDatetime?: string | null; // "YYYY-MM-DD HH:mm:ss" or ISO
  sellerName?: string | null;
};

function requiredFieldsPresent(o: Partial<OrderRecord>): o is OrderRecord {
  return (
    typeof o.companyId === 'string' &&
    typeof o.storeId === 'number' &&
    typeof o.orderId === 'number' &&
    typeof o.skuId === 'string' &&
    typeof o.produced === 'number'
  );
}

export async function listOrders(env: Env, query: URLSearchParams) {
  const where: string[] = [];
  const binds: any[] = [];
  const companyId = query.get('companyId');
  const storeId = query.get('storeId');
  const orderId = query.get('orderId');
  const skuId = query.get('skuId');
  const startdate = query.get('startdate');
  const enddate = query.get('enddate');
  if (companyId) { where.push('companyId = ?'); binds.push(companyId); }
  if (storeId) { where.push('storeId = ?'); binds.push(Number(storeId)); }
  if (orderId) { where.push('orderId = ?'); binds.push(Number(orderId)); }
  if (skuId) { where.push('skuId = ?'); binds.push(skuId); }
  if (startdate) { where.push('saleDatetime >= ?'); binds.push(`${startdate} 00:00:00`); }
  if (enddate) { where.push('saleDatetime <= ?'); binds.push(`${enddate} 23:59:59`); }
  const limit = Math.min(Number(query.get('limit') || 100), 1000);
  const offset = Math.max(Number(query.get('offset') || 0), 0);
  const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY saleDatetime DESC, id DESC LIMIT ? OFFSET ?;`;
  binds.push(limit, offset);
  const res = await env.AUTH_DB.prepare(sql).bind(...binds).all<OrderRecord>();
  return Response.json(res.results ?? []);
}

export async function getOrder(env: Env, id: number) {
  const res = await env.AUTH_DB.prepare('SELECT * FROM orders WHERE id = ?;').bind(id).first<OrderRecord>();
  if (!res) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' }});
  return Response.json(res);
}

export async function deleteOrder(env: Env, id: number) {
  const res = await env.AUTH_DB.prepare('DELETE FROM orders WHERE id = ?;').bind(id).run();
  return Response.json({ deleted: res.meta.changes ?? 0 });
}

export async function upsertOrder(env: Env, record: Partial<OrderRecord>) {
  if (!requiredFieldsPresent(record)) {
    return new Response(JSON.stringify({ error: 'Campos obrigatórios: companyId (string), storeId (number), orderId (number), skuId (string), produced (number).' }), { status: 400, headers: { 'content-type': 'application/json' }});
  }
  const cols = [
    'companyId','produced','storeId','orderId','skuId','productId','category','model','cost','subcategory','brand','collection','quantity','salePrice','discount','total','description','color','size','transactionCode','customerName','payment','saleDatetime','sellerName'
  ];
  const values = cols.map(k => (record as any)[k] ?? null);
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.filter(c => !['companyId','storeId','orderId','skuId'].includes(c)).map(c => `${c} = excluded.${c}`).join(',');
  const sql = `INSERT INTO orders (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(companyId, storeId, orderId, skuId) DO UPDATE SET ${updates};`;
  const res = await env.AUTH_DB.prepare(sql).bind(...values).run();
  return Response.json({ ok: true, changes: res.meta.changes ?? 0 });
}

export async function bulkUpsert(env: Env, records: Partial<OrderRecord>[]) {
  if (!Array.isArray(records)) {
    return new Response(JSON.stringify({ error: 'Array de registros esperado.' }), { status: 400, headers: { 'content-type': 'application/json' }});
  }
  let ok = 0; let bad: number[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!requiredFieldsPresent(r as any)) { bad.push(i); continue; }
    const cols = [
      'companyId','produced','storeId','orderId','skuId','productId','category','model','cost','subcategory','brand','collection','quantity','salePrice','discount','total','description','color','size','transactionCode','customerName','payment','saleDatetime','sellerName'
    ];
    const values = cols.map(k => (r as any)[k] ?? null);
    const placeholders = cols.map(() => '?').join(',');
    const updates = cols.filter(c => !['companyId','storeId','orderId','skuId'].includes(c)).map(c => `${c} = excluded.${c}`).join(',');
    const sql = `INSERT INTO orders (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(companyId, storeId, orderId, skuId) DO UPDATE SET ${updates};`;
    const res = await env.AUTH_DB.prepare(sql).bind(...values).run();
    ok += res.meta.changes ?? 0;
  }
  return Response.json({ ok, bad });
}