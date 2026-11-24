// Shared harness for the API end-to-end tests.
// Uses a SEPARATE test database (MONGODB_TEST_URI) – never the real one.
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const prepareEnv = (dbName) => {
  const url = new URL(process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27999");
  url.pathname = `/${dbName}`;
  const uri = url.toString();
  if (!/test|e2e|load/i.test(dbName)) throw new Error("Test database name must contain test/e2e/load");
  if (process.env.MONGODB_URI && process.env.MONGODB_URI === uri) throw new Error("Refusing to run against MONGODB_URI");
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = `test-secret-${Math.random()}`;
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:3000";
  process.env.PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.BANK_DETAILS_ENCRYPTION_KEY = "a".repeat(64);
  // Never send real emails or touch real payment accounts
  for (const k of [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
    "ADMIN_NOTIFICATION_EMAIL", "PAYPALAPIKEY", "PAYPALSECRET_KEY", "PAYPAL_API_BASE", "HOURLY_RATE_CENTS",
    // never let tests touch the LIVE PayPal account
    "PAYPAL_MODE", "PAYPAL_CLIENT_ID", "PAYPAL_SECRET_KEY",
  ]) delete process.env[k];
};

export const createChecker = () => {
  let failures = 0;
  let passes = 0;
  const check = (name, cond, extra) => {
    if (cond) passes++;
    else failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 500) : ""}`);
  };
  return { check, summary: () => ({ failures, passes }) };
};

export const apiClient = (base) => {
  const call = async (method, p, body, token) => {
    const res = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return call;
};

/**
 * Minimal PayPal Orders v2 mock (no real money). Behaviour per order can be
 * set with mock.nextCapture = "COMPLETED" | "DECLINED" | "PENDING".
 */
export const startPayPalMock = async () => {
  const orders = new Map();
  const mock = { orders, nextCapture: "COMPLETED", captures: 0, refunds: 0, created: 0 };
  let seq = 0;
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? (raw.startsWith("{") ? JSON.parse(raw) : raw) : {};
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url === "/v1/oauth2/token") return send(200, { access_token: "mock-token", expires_in: 3600 });
    if (req.method === "POST" && req.url === "/v2/checkout/orders") {
      const id = `MOCK${String(++seq).padStart(6, "0")}`;
      const unit = body.purchase_units[0];
      orders.set(id, { id, amount: unit.amount, status: "CREATED", requestId: req.headers["paypal-request-id"] });
      mock.created++;
      return send(201, { id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] });
    }
    const capture = req.url.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (req.method === "POST" && capture) {
      const order = orders.get(capture[1]);
      if (!order) return send(404, { name: "RESOURCE_NOT_FOUND" });
      if (order.status === "COMPLETED") return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
      if (mock.nextCapture === "DECLINED") {
        mock.nextCapture = "COMPLETED";
        return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] });
      }
      const status = mock.nextCapture;
      mock.nextCapture = "COMPLETED";
      order.status = status === "COMPLETED" ? "COMPLETED" : "PENDING";
      order.captureId = `CAP${order.id}`;
      mock.captures++;
      return send(201, orderBody(order, status));
    }
    const get = req.url.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
    if (req.method === "GET" && get) {
      const order = orders.get(get[1]);
      return order ? send(200, orderBody(order, order.status)) : send(404, {});
    }
    if (req.method === "POST" && /^\/v2\/payments\/captures\/[^/]+\/refund$/.test(req.url)) {
      mock.refunds++;
      return send(201, { id: `REF${mock.refunds}`, status: "COMPLETED" });
    }
    return send(404, { name: "NOT_FOUND", url: req.url });
  });
  const orderBody = (order, status) => ({
    id: order.id,
    status: order.status,
    purchase_units: [{ payments: { captures: [{ id: order.captureId, status, amount: order.amount }] } }],
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  mock.url = `http://127.0.0.1:${server.address().port}`;
  mock.close = () => server.close();
  return mock;
};
