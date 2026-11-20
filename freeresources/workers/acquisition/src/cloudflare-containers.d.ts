/**
 * Minimal type surface for the Cloudflare Containers runtime module.
 *
 * `@cloudflare/workers-types` does not yet declare `cloudflare:containers`, so
 * the subset used by this Worker is declared here. These are types only; the
 * runtime implementation is provided by workerd when the Worker is deployed with
 * a `containers` block in wrangler.jsonc.
 */
declare module "cloudflare:containers" {
  export abstract class Container {
    /** Port the container listens on. */
    defaultPort?: number;
    /** Idle time before the container is put to sleep, e.g. "5m". */
    sleepAfter?: string | number;
    fetch(input: RequestInfo | string, init?: RequestInit): Promise<Response>;
  }

  export function getContainer(namespace: DurableObjectNamespace, name?: string): Container;
}
