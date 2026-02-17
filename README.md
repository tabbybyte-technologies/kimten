# 🐈 kimten
🐾 _**A tiny agent loop with paws**_ 🐾

[![build](https://github.com/tabbybyte-technologies/kimten/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tabbybyte-technologies/kimten/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/tabbybyte-technologies/kimten/branch/main/graph/badge.svg)](https://codecov.io/gh/tabbybyte-technologies/kimten)
[![npm](https://img.shields.io/npm/v/%40tabbybyte%2Fkimten)](https://www.npmjs.com/package/@tabbybyte/kimten)
[![last commit](https://img.shields.io/github/last-commit/tabbybyte-technologies/kimten)](https://github.com/tabbybyte-technologies/kimten/commits/main)
[![license](https://img.shields.io/npm/l/%40tabbybyte%2Fkimten)](LICENSE)


Kimten is a minimal micro-agent library: a thin wrapper over the **[Agent interface in Vercel AI SDK Core v6+](https://ai-sdk.dev/docs/agents)**.

It’s meant to feel like a smart helper, not a framework.

## ✅ What it does

- Runs a simple, single-agent loop (bounded by `hops`)
- Lets the LLM model (the `brain`) call your tool functions (the `toys`)
- Supports optional structured output via Zod (controlled by the `box`)
- Keeps short-term conversation memory (in-process, per instance)
- Queues overlapping `play()` calls per cat, so memory order stays tidy and predictable

## ❌ What it does *not* do

- No planners/graphs/state machines
- No streaming API surface
- No persistence or long-term memory
- No plugin system
- No builtin multi-agent orchestration

---

## ✨ Why Kimten?

Use it when you just want a disposable agent loop with toys and a little memory, without adopting a larger framework.

Good fits:

- CLI helpers
- small automations
- local toys
- scripting
- quick AI utilities
- “just let the model call a function” use cases

Each instance keeps short-term chat memory, so follow-up prompts naturally reference earlier messages:

> “summarize this” → “make it shorter” → “now extract bullets”

💡 Kimten agents are tiny, single-purpose, and disposable by design. Don’t expect to rewire them at runtime; steer them by changing the input prompt or the ephemeral context object instead.

---

## 📦 Install

```bash
npm i @tabbybyte/kimten ai zod @ai-sdk/openai
```

### Requirements

- Node `>=22`
- AI SDK Core `>=6`
- Zod `>=3` (v4+ preferred)

---

## 🚀 Full Usage Example

```js
import { openai } from '@ai-sdk/openai'; // or, any other provider
import { z } from 'zod';
import Kimten from '@tabbybyte/kimten';

const cat = Kimten({
  brain: openai('gpt-4o-mini'), // or, any other available model
  name: 'main-cat', // optional public tag

  toys: {
    randomNumber: {
      description: 'Generate a random integer between min and max (inclusive).',
      inputSchema: z.object({ min: z.number().int(), max: z.number().int() }),
      async execute({ min, max }) {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        return Math.floor(Math.random() * (high - low + 1)) + low;
      },
    },
  },

  personality: 'You are a helpful assistant.',

  hops: 10,
});

// free-form text
const text = await cat.play('summarize this repo', {
  requestId: 'req-123', // ephemeral context
  repo: 'tabbybyte/kimten', // ephemeral context
});

// attachments (remote URL + local file path auto-read)
const docsSummary = await cat.play(
  'summarize what you see and extract key text',
  { requestId: 'req-1' }, // context
  {
    attachments: [
      { kind: 'image', image: 'https://example.com/receipt.jpg' },
      { kind: 'file', data: './cv.pdf', mediaType: 'application/pdf' }, // auto-read from disk
    ],
  }
);

// optional generation knobs
const drafted = await cat.play('draft 3 variants', null, {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 400,
});

// Another Kimten agent!
const jsonCat = Kimten({
  brain: openai('gpt-4o-mini'),
  name: 'json-cat', // optional public tag
  personality: 'You are a helpful assistant.',
  box: z.object({ name: z.string() }), // fixed for this instance
});

// structured output (from configured box)
const structured = await jsonCat.play('extract the name', {
  source: 'profile bio', // ephemeral context
});

console.log({ text, docsSummary, drafted, structured });

// wipe short-term memory
cat.forget();
jsonCat.forget();
```

---

## ⚙️ API

### `Kimten(config)`

Create a new instance.

#### Required
* 🧠 `brain` → AI SDK model instance

#### Optional

* 🎱 `toys` → object map of toy (tool) definitions. Each entry is:
  * object form: `{ inputSchema?, description?, strict?, execute }`
  default: `{}`
* 🕵️‍♂️ `personality` → system instructions / prompt for overall behavior description (default: `'You are a helpful assistant.'`)
* 🌀 `hops` → max agent loop steps (default: `10`) - prevents infinite zoomies
* 📦 `box` → optional Zod schema that fixes the output format for this instance
* 🏷️ `name` → optional public instance tag (metadata only; no runtime behavior impact)

#### Toy semantics

- Toy inputs are validated only if you provide `inputSchema`
- Toy results should be JSON-serializable; `undefined` becomes `null`
- If a toy function throws, Kimten returns `{ error, toolName }` as the toy result (it does not re-throw)
- Under the hood, each toy is implemented as an AI SDK tool
- When toys are present, Kimten appends a short tool-usage policy to system instructions

#### Returns

* `play(input, context?, options?)`

  * 🏃 runs the agent  
  * 🧠 uses short-term memory automatically  
  * 💬 returns plain text by default
  * 📦 returns structured output only when `box` is configured during `Kimten(...)`
  * 🧩 when `box` is set, Kimten injects a concise schema hint into each call prompt to improve field-level adherence
  * 🗂️ optional plain object context injected into the current call prompt as JSON (with basic redaction/truncation guards)
  * 🫧 context is ephemeral per `play()` call and is not persisted in memory
  * 🎛️ optional `options` supports attachments and generation knobs (`temperature`, `topP`, `topK`, `maxOutputTokens`)

* `forget()`

  * 🧼 clears short-term memory

* `name` (optional)

  * 🏷️ public tag string exposed on the Kimten instance when configured

##### 🖇️ Attachments (optional)

Attach images or files per call when you want Kimten to process visual/docs input.

- ⚠️ Verify that your `brain` model supports multimodal inputs (images/files); otherwise attachments may be ignored or not processed.

- 🫧 Attachments are optional and ephemeral for each `play()` call (they are not persisted in memory).

- 📂 If an attachment `image`/`data` value is a local file path string and the file exists, Kimten reads it as bytes automatically.

##### 🎛️ Advanced generation knobs (optional)

Kimten keeps this intentionally small. Supported knobs:

- 🌡️ `temperature`
- 🧪 `topP` (number between `0` and `1`)
- 🔢 `topK` (integer `>= 1`)
- ✂️ `maxOutputTokens`

🚫 Unknown option keys get a polite hiss: Kimten keeps the API explicit and predictable.
🚫 Wild numeric values like `Infinity` or `NaN` get swatted away.

---

## 🛠 Tips

### Providers & models

For the `brain` part, feel free to use any compatible provider and their models.

⚠️ Note that not all providers (and models) may work out of the box with Kimten, particularly for structured output and multi modal attachments.

💡 Refer to the AI SDK docs for details: [providers and models](https://ai-sdk.dev/docs/foundations/providers-and-models).

### Add toys freely

Define `toys` in object form for strong arg validation and proper selection by the LLM.

💡 For further details, refer to [AI SDK docs on Tools](https://ai-sdk.dev/docs/foundations/tools)

### Keep hops low

If you need 50+ steps, you probably want a planner, not Kimten.

### Reset when needed

Fresh task? Call `forget()`.  
Cats don’t hold grudges (or context).😽

## 🧩 Skill Registry

This repo ships a Codex-compatible skill at `skills/kimten-agent/SKILL.md`.

It is structured for the [skills.sh](https://www.skills.sh/) ecosystem, so AI coding agents and IDE extensions that support Skills can install it directly from this repository path.

Install via `npx`:

```bash
npx skills add https://github.com/tabbybyte-technologies/kimten --skill kimten-agent
```

---

## License

[MIT](LICENSE)  
Pet responsibly. 🐈‍⬛
