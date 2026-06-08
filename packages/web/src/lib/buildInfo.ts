export function getBuildLabel(): string {
  if (typeof document === "undefined") return "";
  const fromBuildMeta = document
    .querySelector('meta[name="ai-spaces-build"]')
    ?.getAttribute("content")
    ?.trim();
  if (fromBuildMeta) return fromBuildMeta;

  const tag = document.querySelector('meta[name="ai-spaces-tag"]')?.getAttribute("content")?.trim();
  if (tag) return tag;

  const branch = document
    .querySelector('meta[name="ai-spaces-branch"]')
    ?.getAttribute("content")
    ?.trim();
  const sha = document.querySelector('meta[name="ai-spaces-sha"]')?.getAttribute("content")?.trim();
  if (branch && sha) return `${branch}-${sha}`;
  return "";
}
