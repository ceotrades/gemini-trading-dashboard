// Compiles src/app.jsx into plain JavaScript, writes index.html, and writes
// the Netlify _headers file with a CSP hash of that exact script.
// Run after editing the app:  node build.mjs
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const js = execSync(
  "npx --yes esbuild@0.25 src/app.jsx --loader:.jsx=jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --target=es2019 --legal-comments=none",
  { encoding: "utf8" }
);
const script = `\n${js.trim()}\n  `;
const html = readFileSync("src/template.html", "utf8").replace("<script>\n/*__APP__*/\n  </script>", () => `<script>${script}</script>`);
if (!html.includes(script)) throw new Error("template marker not found");
writeFileSync("index.html", html);

const hash = createHash("sha256").update(script).digest("base64");
const worker = "https://jolly-cake-682f.dhruv-kapoorr.workers.dev";
const csp = [
  "default-src 'self'",
  `script-src 'self' https://unpkg.com 'sha256-${hash}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${worker}`,
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");
writeFileSync(
  "_headers",
  `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()

/icons/*
  Cache-Control: public, max-age=604800
`
);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB), _headers written`);
