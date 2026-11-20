/**
 * Runs once per server instance, before requests are served.
 *
 * On Vercel the /tmp SQLite database starts empty on every cold start, so the
 * catalog would render with zero rows even though Cloudflare D1 holds the real
 * data. The hydration step copies D1 into that local database; it is a no-op
 * when D1 is not configured or the database already has data.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { hydrateFromD1 } = await import("./lib/d1-hydrate");
  try {
    const result = await hydrateFromD1();
    if (result.skipped) {
      console.info(`[freeresources] D1 hydration skipped: ${result.reason}`);
    } else {
      console.info(
        `[freeresources] Hydrated ${result.rows} row(s) from Cloudflare D1 (${Object.keys(result.tables).length} table(s)).`,
      );
    }
  } catch (error) {
    console.error(
      `[freeresources] D1 hydration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
