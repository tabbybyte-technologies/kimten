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

- Runs a simple agent loop (bounded by `hops`)
- Lets the model call your tools (`toys`)
- Keeps short-term conversation memory (in-process, per instance)
- Supports optional structured output via Zod

## ❌ What it does *not* do

- No planners/graphs/state machines
- No streaming API surface
- No persistence or long-term memory
- No plugin system or orchestration runtime

---

## ✨ Why Kimten?

Use it when you just want an agent loop with tools and a little memory, without adopting a larger framework.

Good fits:

- CLI helpers
- small automations
- local tools
- scripting
- quick AI utilities
- “just let the model call a function” use cases

---

## 📦 Install

```bash
npm i @tabbybyte/kimten ai zod @ai-sdk/openai
```

### Requirements

- Node `>=22`
- AI SDK Core `>=6`
- Zod `>=3`

---

## 🚀 Usage

```js
import { openai } from '@ai-sdk/openai'; // or, any other provider
import { z } from 'zod';
import Kimten from '@tabbybyte/kimten';

const cat = Kimten({
  brain: openai('gpt-4o-mini'), // or, any other available model

  toys: {
    add: async ({ a, b }) => a + b,
  },

  hops: 10,
});

// free-form text
const text = await cat.play('summarize this repo');

// structured output
const structured = await cat.play(
  'extract the name',
  z.object({ name: z.string() })
);

// wipe short-term memory
cat.forget();
```

---

## 🧠 Mental Model

Kimten is basically:

```
loop:
  include short-term conversation memory
  prompt LLM
  maybe call a tool
  repeat (max hops)
return result
```

Each instance keeps short-term chat memory, so follow-up prompts naturally reference earlier messages:

> “summarize this” → “make it shorter” → “now extract bullets”

---

## ⚙️ API

### `Kimten(config)`

Create a new instance.

#### Required
* `brain` → AI SDK model instance

#### Optional

* `toys` → object map of tool definitions. Each entry can be:
  * async function shorthand: `async (args) => result`
  * object form: `{ inputSchema?, description?, strict?, execute }`
  default: `{}`
* `personality` → system prompt / behavior description (default: `"You are a helpful assistant."`)
* `hops` → max agent loop steps (default: `10`)  
  prevents infinite zoomies 🌀

#### Tool semantics

- Tool inputs are validated only if you provide `inputSchema` (shorthand tools accept anything).
- Tool results should be JSON-serializable; `undefined` becomes `null`.
- If a tool throws, Kimten returns `{ error, toolName }` as the tool result (it does not re-throw).

#### Returns

* `play(input, schema?)`

  * runs the agent  
  * uses short-term memory automatically  
  * optional Zod schema for structured output

* `forget()`

  * clears short-term memory/context

---

## 🛠 Tips

### Providers & models

For the `brain` part, feel free to use any compatible provider and their models.

Refer to the AI SDK docs: **[providers and models](https://ai-sdk.dev/docs/foundations/providers-and-models)**.

### Add tools freely

Tools can stay simple, just normal async functions:

```js
toys: {
  readFile,
  writeFile,
  fetchJson,
  runCommand,
}
```

For stronger arg validation and better tool selection, use object form:

```js
import { z } from 'zod';

toys: {
  add: {
    description: 'Add two numbers.',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    async execute({ a, b }) {
      return a + b;
    },
  },
}
```
💡 For further details, refer to [AI SDK docs on Tools](https://ai-sdk.dev/docs/foundations/tools)

### Keep hops low

If you need 50+ steps, you probably want a planner, not Kimten.

### Reset when needed

Fresh task? Call `forget()`.  
Cats don’t hold grudges (or context).😽

---

## License

[MIT](LICENSE)  
Pet responsibly. 🐈‍⬛
