/*
<MODULE_CONTRACT>
<purpose>This module handles HTTP requests and serves markdown content based on the request URL and headers. It provides a markdown representation of the homepage and other specific pages.</purpose>
<non-goals>
  <item>This module does not handle non-markdown content types or complex routing logic beyond basic markdown serving.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of markdown content serving based on request headers and URL paths.</item>
</CHANGE_SUMMARY>
*/

import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequest: PagesFunction = async (context) => {
  const accept = context.request.headers.get("accept") ?? "";
  const url = new URL(context.request.url);

  if (!accept.includes("text/markdown")) {
    return context.next();
  }

  // Homepage → serve llms.txt as markdown
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const llms = await fetch(new URL("/llms.txt", url.origin));
    const body = await llms.text();
    return new Response(body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Markdown-Tokens": String(body.split(/\s+/).length),
      },
    });
  }

  // For other pages, generate a simple markdown representation
  const pageName = url.pathname.replace(/^\//, "").replace(/\.html$/, "") || "index";
  const pageTitles: Record<string, string> = {
    methodik: "Methodik — HDRI Dashboard",
    codebook: "Codebook — HDRI Dashboard",
    faq: "FAQ — HDRI Dashboard",
    glossar: "Glossar — HDRI Dashboard",
    impressum: "Impressum — HDRI Dashboard",
    datenschutz: "Datenschutz — HDRI Dashboard",
  };

  const title = pageTitles[pageName] ?? "HDRI Dashboard";
  const md = `# ${title}\n\n> Öffentliches Dashboard für veröffentlichte HDRI-Quartalsindizes, Verlauf und sichere Vergleiche der digitalen Reife deutscher Handwerksbetriebe.\n\nWeitere Informationen: <https://handwerk-index.org/>\n`;

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Markdown-Tokens": String(md.split(/\s+/).length),
    },
  });
};
