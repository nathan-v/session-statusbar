export type Bucket = { input: number; output: number }
// advisorUsd is optional: totals saved by an earlier version lack it.
export type Totals = {
  main: Bucket
  agents: Bucket
  advisorCalls: number
  advisorUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-statusbar': { totals: Totals }
  }
}
