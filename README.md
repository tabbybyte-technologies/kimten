# 🐈 kimten

A micro-agent library: thin wrapper over the **[Agent interface in Vercel AI SDK Core v6+](https://ai-sdk.dev/docs/agents)** 

Small surface area, sharp claws, zero fluff (well… almost).

Think:

> minimal agent loop + tools + short-term memory  
> but delivered as a smol terminal cat 🐾

Kimten doesn’t try to be a “framework”.  
It’s just a neat little helper that runs prompts, calls tools, remembers a little, and gets out of your way.

No planners.  
No graphs.  
No magic state machines.  
Just *play → result → nap*. 😼

---

## ✨ Why Kimten?

Sometimes you don’t want:

- 15 abstractions
- 6 middlewares
- 4 “agent runtimes”
- 200MB of dependencies

You just want:

✔ call an LLM  
✔ give it tools  
✔ keep a bit of convo memory  
✔ maybe get structured output  
✔ done

Kimten = **tiny agent loop with paws** 🐾

Perfect for:

- CLI helpers
- small automations
- local tools
- scripting
- quick AI utilities
- “just let the model call a function” use cases

---

## 📦 Install

Feed the cat some treats:

```bash
npm i @tabbybyte/kimten ai zod @ai-sdk/openai
```

That’s it. No ceremony. No rituals. 🍗

### Requirements

- Node `>=22`
- AI SDK Core `>=6`
- Zod `>=3`

---

## 🚀 Usage

Summon your little helper (with or without `toys`) and let it `play`.

```js
import { openai } from '@ai-sdk/openai'; // or, any other provider
import { z } from 'zod';
import Kimten from '@tabbybyte/kimten';

const cat = Kimten({
  brain: openai('gpt-4o-mini'), // or, any other available model

  toys: {
    add: async ({ a, b }) => a + b,
  },

  personality: 'Helpful terminal cat',

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

Done.  
No lifecycle hooks. No config jungle. 🧘

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

That’s the whole thing.

Each instance keeps a **small, short-term chat memory** 🧠  
So follow-up prompts naturally reference earlier messages:

> “summarize this” → “make it shorter” → “now extract bullets”

When you’re done, call `forget()` and the brain goes blank again. 🫧

It’s intentionally:

* tiny
* predictable
* hackable
* easy to read in one sitting

If you can read the source in ~5 minutes, we did it right 😺

---

## ⚙️ API

### `Kimten(config)`

Create a new cat.

### Required (must-haves)

* `brain` → AI SDK model instance  

### Optional (extra whiskers)

* `toys` → object map of tool definitions. Each entry can be:
  * async function shorthand: `async (args) => result`
  * object form: `{ inputSchema?, description?, strict?, execute }`
  default: `{}`
* `personality` → system prompt / behavior description (default: `"You are a helpful assistant."`)
* `hops` → max agent loop steps (default: `10`)  
  prevents infinite zoomies 🌀

### Tool semantics (important)

- Tool inputs are validated only if you provide `inputSchema` (shorthand tools accept anything).
- Tool results should be JSON-serializable; `undefined` becomes `null`.
- If a tool throws, Kimten returns `{ error, toolName }` as the tool result (it does not re-throw).

### Returns

* `play(input, schema?)`

  * runs the agent  
  * uses short-term memory automatically  
  * optional Zod schema for structured output

* `forget()`

  * clears short-term memory/context

---

## 🧩 Design Philosophy & Vibes

Kimten intentionally avoids “big agent framework energy”.

It’s meant to be:

* small
* opinionated
* dependency-light
* short-term memory by design
* easy to embed anywhere

No:

* streaming APIs
* planners or graphs
* middleware/plugins
* long-term memory
* persistence/storage
* hidden background processes
* TypeScript runtime/build nonsense
* full fledged orchestration system

If you need those… use something heavier.

If you want **simple + fast + composable**, Kimten fits nicely.

---

## 🛠 Tips

### Providers & models

For the `brain` part, feel free to use any compatible provider and their models.

Refer to https://ai-sdk.dev/docs/foundations/providers-and-models

### Add tools freely

Tools can stay simple:

```js
toys: {
  readFile,
  writeFile,
  fetchJson,
  runCommand,
}
```

The model decides when to use them.

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

### Small “real” example

```js
toys: {
  fetchJson: {
    description: 'Fetch JSON from a URL (GET).',
    inputSchema: z.object({ url: z.string().url() }),
    async execute({ url }) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  },
}
```

### Structured output = sanity

Use Zod schemas whenever possible.  
LLMs lie less when types exist 😼

### Keep hops low

If you need 50+ steps, you probably want a planner, not Kimten.

### Reset when needed

Fresh task? Call `forget()`.  
Cats don’t hold grudges (or context). 🐾

---

## License

MIT  
Pet responsibly.
