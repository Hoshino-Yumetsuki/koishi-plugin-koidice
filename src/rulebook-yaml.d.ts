declare module '*.yaml' {
  const rulebook: { rule: string; manual: Record<string, string> };
  export default rulebook;
}
