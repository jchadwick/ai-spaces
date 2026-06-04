import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const srcDir = join(root, "src");

const allowedRawColorFiles = new Set(["src/index.css"]);
const sourceExtensions = new Set([".css", ".html", ".ts", ".tsx"]);

const bannedPatterns = [
  { name: "legacy surface utility", pattern: /\bbg-surface(?:-[\w-]+)?\b/g },
  { name: "legacy surface text utility", pattern: /\btext-on-surface(?:-[\w-]+)?\b/g },
  { name: "legacy surface token", pattern: /surface-container|on-surface/g },
  { name: "legacy font utility", pattern: /\bfont-(?:display|ui)\b/g },
  { name: "legacy serif family", pattern: /Instrument Serif/g },
  { name: "runtime theme picker", pattern: /ThemePicker|ThemeProvider|ThemeContext|PALETTES|useTheme|ai-spaces-theme/g },
  { name: "camelCase Tailwind token utility", pattern: /\b(?:bg|text|border|hover:bg|hover:text)-t-[A-Za-z]*[A-Z][A-Za-z-]*\b/g },
  { name: "legacy error utility", pattern: /\b(?:bg-error-container|text-error|border-error|hover:bg-error)\b/g },
  { name: "legacy primary foreground utility", pattern: /\b(?:text-on-primary|border-on-primary|border-t-on-primary)\b/g },
  { name: "old rust rgba", pattern: /rgba\(\s*194\s*,\s*65\s*,\s*12\s*,/g },
  { name: "old rust hex", pattern: /#C2410C|#c2410c/g },
];

const rawHexPattern = /#[0-9A-Fa-f]{3,8}\b/g;

function extension(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (entry === "assets") continue;
      files.push(...walk(path));
      continue;
    }

    if (sourceExtensions.has(extension(path))) {
      files.push(path);
    }
  }

  return files;
}

const failures = [];

for (const file of [join(root, "index.html"), ...walk(srcDir)]) {
  const rel = relative(root, file);
  const content = readFileSync(file, "utf8");

  for (const { name, pattern } of bannedPatterns) {
    pattern.lastIndex = 0;
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const line = content.slice(0, match.index).split("\n").length;
      failures.push(`${rel}:${line} ${name}: ${match[0]}`);
    }
  }

  if (!allowedRawColorFiles.has(rel)) {
    rawHexPattern.lastIndex = 0;
    const matches = content.matchAll(rawHexPattern);
    for (const match of matches) {
      const line = content.slice(0, match.index).split("\n").length;
      failures.push(`${rel}:${line} raw hex color outside theme file: ${match[0]}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Theme enforcement failed:");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
