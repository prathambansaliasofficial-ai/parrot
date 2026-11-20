/**
 * PDF container Worker.
 *
 * Owns the Cloudflare Container instance and proxies requests to it. Deployed
 * separately (`wrangler deploy --config wrangler.pdf.jsonc`) because Containers
 * are a distinct capability: the acquisition Worker keeps working without them.
 *
 * Requires a Workers **paid** plan that includes Containers. Local development
 * additionally requires Docker and, on Windows, WSL.
 */
import { Container, getContainer } from "cloudflare:containers";

export class PdfContainer extends Container {
  defaultPort = 8080;
  /** Stop billing after five idle minutes. */
  sleepAfter = "5m";
}

interface PdfEnv {
  PDF: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: PdfEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "freeresources-pdf-container" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname !== "/process" || request.method !== "POST") {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }
    const container = getContainer(env.PDF, "pdf-processor");
    return container.fetch(request);
  },
};
