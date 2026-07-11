#!/usr/bin/env node
/**
 * Entry point: wire config -> client -> service -> tools and serve over stdio.
 *
 * All diagnostics go to stderr; stdout is reserved for the MCP protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZephyrClient } from "./client.js";
import { ConfigError, loadConfig } from "./config.js";
import { ReviewService } from "./service.js";
import { registerTools } from "./tools.js";

export function createServer(): McpServer {
  const config = loadConfig();
  // Startup diagnostics on stderr (never stdout) for region misconfig triage.
  console.error(`[zephyr-review-mcp] using Zephyr base URL: ${config.baseUrl}`);

  const client = new ZephyrClient(config);
  const service = new ReviewService(client);

  const server = new McpServer({ name: "zephyr-review-mcp", version: "0.1.0" });
  registerTools(server, service);
  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[zephyr-review-mcp] ready on stdio.");
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`[zephyr-review-mcp] configuration error: ${err.message}`);
  } else {
    console.error(`[zephyr-review-mcp] fatal: ${(err as Error).message}`);
  }
  process.exit(1);
});
