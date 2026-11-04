import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Totals } from '../types'

const PANE = 'session-statusbar'

const totals = atom({ plugin: 'session-statusbar', key: 'totals' } as const, {
  main: { input: 0, output: 0 },
  agents: { input: 0, output: 0 },
  advisorCalls: 0,
  advisorUsd: 0,
} as Totals)

const k = (n: number): string =>
  n >= 999_500
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "claude-sonnet-5-5[1m]" -> "Sonnet 5.5"; an alias like "opus" -> "Opus".
// Anything that is not a Claude id or alias (a custom or gateway model such as
// "gemini-4-argon") is shown exactly as configured.
const niceModel = (id: string): string => {
  const m = id.replace(/\[.*\]$/, '')
  const v = m.match(
    /^(?:[a-z0-9.]*\.)?(?:claude-)?(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2})(?!\d))?/,
  )
  if (v) return `${cap(v[1] ?? '')} ${v[2] ?? ''}${v[3] ? `.${v[3]}` : ''}`
  if (/^(opus|sonnet|haiku|fable)$/.test(m)) return cap(m)
  return m || 'unknown'
}

// A block meter, and the theme color for how full it is. The color names are
// theme keys, so the bar follows the person's theme.
const meter = (pct: number, cells = 8): string => {
  const on = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return '▰'.repeat(on) + '▱'.repeat(cells - on)
}
const heat = (pct: number): string =>
  pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success'

type Field = { key: string; label: string; value: string; color?: string }
const width = (f: Field): number => f.label.length + 2 + f.value.length

const tok = (b: { input: number; output: number }) =>
  `${k(b.input)}/${k(b.output)}`

// The compact line for under the prompt: the engine cuts it where the row ends,
// so the most useful figures come first.
function compact(
  model: string,
  advisor: string | null,
  usage: { context: { tokens?: number; percent?: number }; cost?: { usd: number } },
  t: Totals,
): string {
  const { context, cost } = usage
  const pct = context.percent
  const advisorCost =
    advisor && t.advisorCalls > 0 ? ` (Advisor ~$${(t.advisorUsd ?? 0).toFixed(2)})` : ''
  const parts = [
    pct !== undefined
      ? `${meter(pct)} ${Math.round(pct)}%`
      : context.tokens
        ? k(context.tokens)
        : null,
    cost ? `$${cost.usd.toFixed(2)}${advisorCost}` : null,
    niceModel(model),
    advisor ? `Advisor ${niceModel(advisor)}` : null,
  ].filter((x): x is string => x !== null)
  return `  ${parts.join(' | ')}`
}

// Everything the bar and the pane read from the session. A top-level function:
// the engine only follows `$` into functions declared at the top of the file.
async function snapshot($: any, breakdown?: 'summary', columns?: number) {
  const [model, usage, advisor, t] = await Promise.all([
    $.session.model() as Promise<string>,
    $.session.usage(breakdown ? { breakdown, columns } : undefined),
    // The user file first: /advisor writes there, and the merged read can lag it.
    $.settings
      .read({ key: 'advisorModel', source: 'user' })
      .then((v: unknown) => v ?? $.settings.read({ key: 'advisorModel' })),
    read($, totals),
  ])
  const hasAdvisor = typeof advisor === 'string' && advisor !== ''
  return {
    model,
    usage,
    advisor: hasAdvisor ? (advisor as string) : null,
    t: t as Totals,
  }
}

export const register: Register = (on, options) => {
  // Where the bar draws: above the prompt (band), compact under it (hint), or both.
  const placement = options.placement ?? 'band'
  const showBand = placement === 'band' || placement === 'both'
  const showHint = placement === 'hint' || placement === 'both'

  // The advisor cost estimate keeps its working state in module variables, so a
  // hot reload restarts its baseline (the next advisor call adds $0 until a few
  // ordinary steps have been seen). The totals themselves live in $.state.
  const seen = new Set<string>()
  let lastCost: number | undefined
  let mainSum = 0
  let mainN = 0

  // Token totals per loop. Input counts uncached, cache-written and cache-read.
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      const input =
        u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const key = e.agentId ? 'agents' : 'main'
      await update($, totals, t => ({
        ...t,
        [key]: {
          input: t[key].input + input,
          output: t[key].output + u.output_tokens,
        },
      }))
    }
    return next(e)
  })

  // The API reports no token counts or price for the advisor. Count its calls,
  // and estimate its cost: a main-loop step that called the advisor costs more
  // than the average main-loop step, and the excess is attributed to the
  // advisor. Rough by design: the cost is the session ledger as read after the
  // step returns, and the types do not say whether the ledger has already
  // priced that step, so the split can land one step late.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)

    // Count each call once, by id, in case a result repeats earlier ones.
    const fresh = (r.serverToolUses ?? []).filter(
      s => s.name === 'advisor' && !seen.has(s.id),
    )
    fresh.forEach(s => seen.add(s.id))

    let extra = 0
    const usd = (await $.session.usage()).cost?.usd
    if (usd !== undefined) {
      // Every step moves the reading forward, but only main-loop steps feed
      // the baseline, so a subagent's own steps do not skew it.
      if (lastCost !== undefined && !e.agentId) {
        const delta = Math.max(0, usd - lastCost)
        if (fresh.length > 0) {
          extra = mainN > 0 ? Math.max(0, delta - mainSum / mainN) : 0
        } else {
          mainSum += delta
          mainN += 1
        }
      }
      lastCost = usd
    }

    if (fresh.length > 0) {
      await update($, totals, t => ({
        ...t,
        advisorCalls: t.advisorCalls + fresh.length,
        advisorUsd: (t.advisorUsd ?? 0) + extra,
      }))
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)

    const { model, usage, advisor, t } = await snapshot($)
    const { context, cost } = usage

    // Fields in display order. Narrow terminals drop them in priority order
    // (tokens, then advisor, then model) so context and cost stay longest.
    const pct = context.percent
    let left: Field[] = [
      { key: 'model', label: 'Model', value: niceModel(model) },
      advisor ? { key: 'advisor', label: 'Advisor', value: niceModel(advisor) } : null,
      {
        key: 'context',
        label: 'Context',
        value:
          context.window > 0
            ? `${pct !== undefined ? `${meter(pct)} ` : ''}${k(context.tokens ?? 0)} of ${k(context.window)}${pct !== undefined ? ` (${Math.round(pct)}%)` : ''}`
            : k(context.tokens ?? 0),
        color: pct !== undefined ? heat(pct) : undefined,
      },
      {
        key: 'tokens',
        label: 'Tokens',
        value:
          `main ${tok(t.main)}, agents ${tok(t.agents)}` +
          (advisor ? `, advisor ${t.advisorCalls} calls` : ''),
      },
    ].filter((f): f is Field => f !== null)

    const advisorCost =
      advisor && t.advisorCalls > 0 ? ` (Advisor ~$${(t.advisorUsd ?? 0).toFixed(2)})` : ''
    let right: Field | null = cost
      ? {
          key: 'cost',
          label: 'Session cost total',
          value: `$${cost.usd.toFixed(2)}${advisorCost}`,
        }
      : null

    const budget = e.props.bodyColumns
    const total = () =>
      left.reduce((n, f) => n + width(f), 0) +
      Math.max(0, left.length - 1) * 3 +
      (right ? width(right) + 2 : 0)
    for (const drop of ['tokens', 'advisor']) {
      if (total() > budget) left = left.filter(f => f.key !== drop)
    }
    if (right && total() > budget) right = { ...right, label: 'Cost' }
    if (total() > budget) left = left.filter(f => f.key !== 'model')

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box justifyContent="space-between">
        <Text wrap="truncate">
          {left.flatMap((f, i) => [
            i > 0 ? <Text dimColor>{' | '}</Text> : null,
            <Text>
              <Text dimColor>{`${f.label}: `}</Text>
              <Text color={f.color}>{f.value}</Text>
            </Text>,
          ])}
        </Text>
        {right ? (
          <Text wrap="truncate">
            <Text dimColor>{`${right.label}: `}</Text>
            <Text>{right.value}</Text>
          </Text>
        ) : null}
      </Box>
    )
  })

  // Under the prompt: add dim text to the end of the engine's own hint line. The
  // engine keeps the line (its pills, the permission mode among them, stay live)
  // and cuts the tail where the row ends. One plain dim string, so no color here.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!showHint) return next(e)

    const { model, usage, advisor, t } = await snapshot($)
    return next({
      ...e,
      props: { ...e.props, tail: compact(model, advisor, usage, t) },
    })
  })

  // /statusbar opens a pane with the detail the bar has no room for; /statusbar close
  // closes it. A pane trades horizontal space for vertical, which some people
  // prefer to a band above the prompt.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'statusbar',
      description: 'Show session usage detail in a pane (/statusbar close to close)',
      argumentHint: '[close]',
    })
    return next(e)
  })

  on('command.run', { command: 'statusbar' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Session pane closed.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Session' })
    return {
      text: opened.isPlaced
        ? 'Session pane opened.'
        : 'Session pane is open but not drawn yet; it needs a wider terminal.',
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { model, usage, advisor, t } = await snapshot(
      $,
      'summary',
      e.props.bodyColumns,
    )
    const { context, cost } = usage
    const { Box, Text } = $.ui.resolve(e)

    const row = (label: string, value: string, color?: string) => (
      <Box justifyContent="space-between">
        <Text dimColor>{label}</Text>
        <Text color={color}>{value}</Text>
      </Box>
    )

    const cats = [...(context.breakdown?.categories ?? [])]
      .filter(c => c.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 8)
    const pct = context.percent
    const advisorCost =
      advisor && t.advisorCalls > 0 ? `~$${(t.advisorUsd ?? 0).toFixed(2)}` : null

    return (
      <Box flexDirection="column">
        <Text weight="bold">Models</Text>
        {row('Main', niceModel(model))}
        {advisor ? row('Advisor', niceModel(advisor)) : null}

        <Text weight="bold">Context</Text>
        {row(
          'In use',
          context.window > 0
            ? `${k(context.tokens ?? 0)} of ${k(context.window)}${pct !== undefined ? ` (${Math.round(pct)}%)` : ''}`
            : k(context.tokens ?? 0),
          pct !== undefined ? heat(pct) : undefined,
        )}
        {cats.map(c => row(`  ${c.name}`, k(c.tokens)))}

        <Text weight="bold">Tokens (input/output)</Text>
        {row('Main', tok(t.main))}
        {row('Agents', tok(t.agents))}
        {advisor ? row('Advisor calls', `${t.advisorCalls}`) : null}

        <Text weight="bold">Cost</Text>
        {cost ? row('Session total', `$${cost.usd.toFixed(2)}`) : null}
        {advisorCost ? row('Advisor (estimate)', advisorCost) : null}
      </Box>
    )
  })
}
