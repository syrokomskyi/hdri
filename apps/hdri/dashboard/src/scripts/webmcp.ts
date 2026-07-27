/*
<MODULE_CONTRACT>
<purpose>This module provides navigation and data-retrieval tools for AI agents to interact with the HDRI Dashboard, facilitating automated access and manipulation of dashboard content.</purpose>
<non-goals>
  <item>This module does not handle user authentication or authorization.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of WebMCP tools for HDRI Dashboard navigation and data retrieval.</item>
</CHANGE_SUMMARY>
*/

/**
 * WebMCP support for HDRI Dashboard
 * Exposes dashboard navigation and data-retrieval tools to AI agents.
 */

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const tools: WebMcpTool[] = [
  {
    name: "navigateToPage",
    description:
      "Navigate to a specific page on the HDRI Dashboard (e.g., methodik, codebook, faq, glossar).",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["", "methodik", "codebook", "faq", "glossar", "impressum", "datenschutz"],
          description: "Page slug to navigate to. Use empty string for homepage.",
        },
      },
      required: ["page"],
    },
    async execute(args: Record<string, unknown>) {
      const page = String(args.page ?? "");
      const path = page ? `/${page}` : "/";
      window.location.href = path;
      return { success: true, navigatedTo: path };
    },
  },
  {
    name: "scrollToSection",
    description: "Scroll to a section on the current page by CSS selector or ID.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            'CSS selector or element ID to scroll to (e.g., "#overview", ".section-title").',
        },
      },
      required: ["selector"],
    },
    async execute(args: Record<string, unknown>) {
      const selector = String(args.selector ?? "");
      const el = document.querySelector(selector);
      if (!el) return { success: false, error: `Element not found: ${selector}` };
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return { success: true, selector };
    },
  },
  {
    name: "getCurrentPeriod",
    description: "Return the currently displayed HDRI period and sample size.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const el = document.querySelector("[data-period]");
      const period = el?.getAttribute("data-period") ?? "2026-q2";
      const sampleEl = document.querySelector("[data-sample-size]");
      const sampleSize = sampleEl?.getAttribute("data-sample-size") ?? "38121";
      return { period, sampleSize: Number(sampleSize) };
    },
  },
];

function initWebMcp(): void {
  const modelContext = (navigator as unknown as Record<string, unknown>).modelContext as
    | { registerTool?: (tool: WebMcpTool, signal?: AbortSignal) => void }
    | undefined;

  if (!modelContext?.registerTool) {
    return;
  }

  const controller = new AbortController();

  tools.forEach((tool) => {
    modelContext.registerTool!(tool, controller.signal);
  });

  // Unregister on page unload
  window.addEventListener("beforeunload", () => controller.abort());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWebMcp);
} else {
  initWebMcp();
}
