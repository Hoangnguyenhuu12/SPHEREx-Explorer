declare module 'aladin-lite' {
  // Aladin Lite ships without TypeScript types; the wrapper in features/sky-map narrows usage.
  // oxlint-disable-next-line typescript/no-explicit-any
  const A: any
  export default A
}
