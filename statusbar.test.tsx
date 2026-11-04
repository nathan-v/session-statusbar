import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-statusbar',
  component: 'AbovePrompt',
  requestId: 'session-statusbar',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 400,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'session-statusbar',
  component: 'Pane',
  requestId: 'session-statusbar',
  surface: 'terminal',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Setup = {
  model: string
  advisor?: string
  usage?: {
    context: {
      tokens?: number
      window: number
      percent?: number
      breakdown?: { categories: { name: string; tokens: number }[] }
    }
    cost?: { usd: number }
  }
  totals?: unknown
}

const USAGE = {
  startedAt: 0,
  context: { tokens: 121_000, window: 1_000_000, percent: 12.1 },
  rateLimits: [],
  cost: { usd: 1.61 },
}

// Stand in for the engine beneath the plugin.
function engine(on: any, s: Setup) {
  on('session.model', () => ({ value: s.model }))
  // A read of one key is the read of the settings object, projected.
  on('settings.read', () => ({
    value: s.advisor === undefined ? {} : { advisorModel: s.advisor },
  }))
  on('session.usage', () => ({ value: { ...USAGE, ...s.usage } }))
  if (s.totals) on('state.get', () => ({ value: { value: s.totals, version: 1 } }))
}

// Mount a component and return the text of every Text in it, joined.
async function drawn($: any, on: any, s: Setup, mount: object): Promise<string> {
  engine(on, s)
  const ui = await $.ui.mount(mount)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.map((t: { text?: string }) => t.text ?? '').join('\n')
}

const bar = ($: any, on: any, s: Setup, bodyColumns = 400) =>
  drawn($, on, s, { ...BAND, props: { ...BAND.props, bodyColumns } })

test('the bar shows model, advisor, context meter, tokens and cost', async ($, on) => {
  const text = await bar($, on, { model: 'claude-sonnet-5-5[1m]', advisor: 'claude-opus-5-5' })

  expect(text).toContain('Model: Sonnet 5.5')
  expect(text).toContain('Advisor: Opus 5.5')
  expect(text).toContain('Context: ▰▱▱▱▱▱▱▱ 121k of 1M (12%)')
  expect(text).toContain('Tokens: main 0/0, agents 0/0, advisor 0 calls')
  expect(text).toContain('Session cost total: $1.61')
})

test('with no advisor configured the advisor parts are dropped', async ($, on) => {
  const text = await bar($, on, { model: 'claude-sonnet-5-5' })

  expect(text).not.toContain('Advisor')
  expect(text).not.toContain('advisor')
})

test('a custom model is shown as configured, without cost or window', async ($, on) => {
  const text = await bar($, on, {
    model: 'gemini-4-argon',
    usage: { context: { tokens: 5000, window: 0 } },
    // the stand-in merges shallowly, so state there is no cost
  } as Setup)

  expect(text).toContain('Model: gemini-4-argon')
  expect(text).toContain('Context: 5k')
  expect(text).not.toContain(' of ')
})

test('model ids: Bedrock ids are named, an unknown Claude-shaped id stays raw', async ($, on) => {
  const bedrock = await bar($, on, { model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' })
  expect(bedrock).toContain('Model: Sonnet 4.5')
})

test('an id that is not an opus/sonnet/haiku/fable name is shown as given', async ($, on) => {
  const raw = await bar($, on, { model: 'claude-3-7-sonnet-20250219' })
  expect(raw).toContain('Model: claude-3-7-sonnet-20250219')
})

test('a context just under a million tokens reads 1M, not 1000k', async ($, on) => {
  const text = await bar($, on, {
    model: 'claude-sonnet-5-5',
    usage: { context: { tokens: 999_600, window: 1_000_000, percent: 100 } },
  })

  expect(text).toContain('1M of 1M')
  expect(text).not.toContain('1000k')
})

test('the first render, before any response, shows zero context', async ($, on) => {
  const text = await bar($, on, {
    model: 'claude-sonnet-5-5',
    usage: { context: { window: 1_000_000 } },
  })

  expect(text).toContain('0 of 1M')
  expect(text).not.toContain('NaN')
})

test('totals saved before advisorUsd existed do not produce NaN', async ($, on) => {
  const text = await bar($, on, {
    model: 'claude-sonnet-5-5',
    advisor: 'opus',
    totals: {
      main: { input: 1_400_000, output: 8000 },
      agents: { input: 45_000, output: 541 },
      advisorCalls: 3,
    },
  })

  expect(text).toContain('Advisor: Opus')
  expect(text).toContain('Tokens: main 1.4M/8k, agents 45k/541, advisor 3 calls')
  expect(text).toContain('(Advisor ~$0.00)')
  expect(text).not.toContain('NaN')
})

test('a narrow terminal drops tokens first and keeps context and cost', async ($, on) => {
  const text = await bar($, on, { model: 'claude-sonnet-5-5', advisor: 'opus' }, 70)

  expect(text).not.toContain('Tokens:')
  expect(text).toContain('Context:')
  expect(text).toContain('$1.61')
})

test('the bar draws only where the engine would not: a survey takes the band', async ($, on) => {
  engine(on, { model: 'claude-sonnet-5-5' })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  // No survey: the mod draws, so the engine's text is absent.
  const shown = await $.ui.mount(BAND)
  expect(await shown.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  expect((await shown.find({ type: 'Text', text: /Model:/ }))?.text).toContain('Sonnet 5.5')
  await shown.unmount()

  // Survey up: the mod passes and the engine's drawing shows.
  const held = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect((await held.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await held.unmount()
})

test('the pane lists models, the context categories, tokens and cost', async ($, on) => {
  const text = await drawn(
    $,
    on,
    {
      model: 'claude-sonnet-5-5',
      advisor: 'claude-opus-5-5',
      usage: {
        context: {
          tokens: 121_000,
          window: 1_000_000,
          percent: 12.1,
          breakdown: {
            categories: [
              { name: 'Messages', tokens: 90_000 },
              { name: 'System prompt', tokens: 8_000 },
              { name: 'Free space', tokens: 0 },
            ],
          },
        },
      },
    },
    PANE,
  )

  expect(text).toContain('Models')
  expect(text).toContain('Opus 5.5')
  expect(text).toContain('Messages')
  expect(text).toContain('90k')
  expect(text).not.toContain('Free space')
  expect(text).toContain('Session total')
  expect(text).toContain('$1.61')
})

const HINT = {
  plugin: 'session-statusbar',
  component: 'PromptHint',
  requestId: 'session-statusbar',
  surface: 'terminal',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

// The engine's own hint line, drawn beneath the plugin: it shows what the
// plugin left in `tail`, so a test reads what the plugin added.
function engineHint(on: any) {
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`hint=${e.props.hint}|tail=${e.props.tail ?? ''}`}</Text>
  })
}

test('placement hint adds a compact tail to the engine hint line', { options: { placement: 'hint' } }, async ($, on) => {
  engine(on, { model: 'claude-sonnet-5-5', advisor: 'claude-opus-5-5' })
  engineHint(on)

  const ui = await $.ui.mount(HINT)
  const text = (await ui.find({ type: 'Text' }))?.text ?? ''
  await ui.unmount()

  expect(text).toContain('hint=? for shortcuts')
  expect(text).toContain('▰▱▱▱▱▱▱▱ 12%')
  expect(text).toContain('$1.61')
  expect(text).toContain('Sonnet 5.5')
  expect(text).toContain('Advisor Opus 5.5')
})

test('the default placement leaves the hint line alone', async ($, on) => {
  engine(on, { model: 'claude-sonnet-5-5' })
  engineHint(on)

  const ui = await $.ui.mount(HINT)
  const text = (await ui.find({ type: 'Text' }))?.text ?? ''
  await ui.unmount()

  expect(text).toBe('hint=? for shortcuts|tail=')
})

test('placement hint leaves the band to the engine', { options: { placement: 'hint' } }, async ($, on) => {
  engine(on, { model: 'claude-sonnet-5-5' })
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await ui.find({ type: 'Text', text: /Model:/ })).toBeUndefined()
  await ui.unmount()
})

test('placement both draws the band and the tail', { options: { placement: 'both' } }, async ($, on) => {
  engine(on, { model: 'claude-sonnet-5-5' })
  engineHint(on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ type: 'Text', text: /Model:/ }))?.text).toContain('Sonnet 5.5')
  await band.unmount()

  const hint = await $.ui.mount(HINT)
  expect((await hint.find({ type: 'Text' }))?.text).toContain('$1.61')
  await hint.unmount()
})
