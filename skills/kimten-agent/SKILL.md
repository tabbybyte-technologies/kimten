---
name: kimten-agent
description: Build and troubleshoot lightweight Vercel AI SDK Core v6+ agents using @tabbybyte/kimten. Use when creating a small tool-calling loop, adding typed outputs, attachments, or short-term memory.
license: MIT
compatibility: Works in Node.js projects using AI SDK Core v6+ and Zod.
---

# Kimten Agent Skill

Use this skill when the user needs a compact, server-side agent loop based on Vercel AI SDK Core (`ai`) with `@tabbybyte/kimten`.

## When to Use

- The user wants a minimal wrapper around AI SDK Core agent behavior.
- The task needs tool calling with simple input validation.
- The user wants optional structured output with Zod.
- The user needs attachments and controlled generation options.
- The user needs ephemeral per-call context and short-term in-memory chat history.

## Quick Setup

1. Ensure required packages are installed:
   - `@tabbybyte/kimten`
   - `ai`
   - `zod`
   - provider package like `@ai-sdk/openai`
2. Create a Kimten instance with:
   - `brain` (required model)
   - optional `toys`, `personality`, `hops`, and `box`
3. Use `play(input, context?, options?)` for each task.
4. Use `forget()` when the conversation state should be reset.

## Core Patterns

### 1) Base Agent (text response)

```js
import { openai } from '@ai-sdk/openai';
import Kimten from '@tabbybyte/kimten';

const agent = Kimten({
  brain: openai('gpt-4o-mini'),
  personality: 'You are a concise engineering assistant.',
  hops: 8,
});

const answer = await agent.play('Summarize this PR in 3 bullets.');
```

### 2) Tool Calling with Validation

```js
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import Kimten from '@tabbybyte/kimten';

const agent = Kimten({
  brain: openai('gpt-4o-mini'),
  personality: 'Use tools when needed and explain your result briefly.',
  toys: {
    randomNumber: {
      description: 'Generate random integer in inclusive range.',
      inputSchema: z.object({ min: z.number().int(), max: z.number().int() }),
      async execute({ min, max }) {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        return Math.floor(Math.random() * (high - low + 1)) + low;
      },
    },
  },
});

const out = await agent.play('Pick a random number from 10 to 20.');
```

### 3) Structured Output (`box`)

```js
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import Kimten from '@tabbybyte/kimten';

const agent = Kimten({
  brain: openai('gpt-4o-mini'),
  personality: 'Extract normalized issue data.',
  box: z.object({
    title: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    owner: z.string().nullable(),
  }),
});

const issue = await agent.play('Service degraded, SLO breach, owner unknown.');
```

### 4) Attachments + Context + Generation Options

```js
import { openai } from '@ai-sdk/openai';
import Kimten from '@tabbybyte/kimten';

const agent = Kimten({
  brain: openai('gpt-4o-mini'),
  personality: 'Read attachments and produce concise technical output.',
});

const report = await agent.play(
  'Summarize the attached PDF and extract action items.',
  { requestId: 'req-42', source: 'weekly-review' },
  {
    attachments: [
      { kind: 'file', data: './weekly.pdf', mediaType: 'application/pdf' },
    ],
    temperature: 0.2,
    maxOutputTokens: 300,
  }
);
```

## Implementation Rules

- Keep tools narrow and deterministic.
- Add `inputSchema` to each tool so the model receives explicit parameter shapes.
- Return JSON-serializable tool outputs only.
- Use `box` only when stable structured output is required for the full agent instance.
- Keep `hops` bounded to avoid runaway loops.
- Pass request-scoped data through `context` instead of mutating shared state.

## Decision Guide

- Need plain text and flexibility: do not set `box`.
- Need fixed machine-readable payloads: set `box` and keep schema minimal.
- Need external actions/calculations: add `toys` with strict schemas.
- Need multimodal input: pass `attachments` and verify model capability.
- Need deterministic behavior: lower `temperature` and narrow prompts.

## Troubleshooting Checklist

- Invalid tool input: verify `inputSchema` shape and required fields.
- Missing tool calls: improve tool `description` clarity and system `personality`.
- Bad JSON adherence: tighten the `box` schema and simplify field semantics.
- Context leakage concerns: confirm sensitive data is only sent through call-local `context`.
- Attachments ignored: verify provider/model supports file/image inputs and media type is correct.
- Loop too long or expensive: lower `hops`, simplify prompt, and reduce tool surface.

## Agent Workflow for Coding Tasks

1. Create a dedicated Kimten instance per task type (review, extraction, drafting).
2. Keep the system `personality` narrow and task-specific.
3. Add only the tools needed for that task.
4. Use call-local `context` for request metadata and constraints.
5. If result shape matters downstream, define a `box` schema first.
6. Reset memory with `forget()` between unrelated tasks.
