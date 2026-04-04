export function createToolHook() {
  return (event: unknown) => {
    console.log('[ai-spaces] Tool hook event:', event);
  };
}