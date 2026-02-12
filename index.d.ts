import type { ZodTypeAny, infer as ZodInfer } from 'zod';

export type BrainModel = Record<string, unknown>;

export type ToolExecute = (args: any) => any | Promise<any>;

export type ToyDefinition = {
  inputSchema?: ZodTypeAny;
  description?: string;
  strict?: boolean;
  execute: ToolExecute;
};

export type Toys = Record<string, ToyDefinition>;

export type KimtenConfig = {
  brain: BrainModel;
  toys?: Toys;
  personality?: string;
  hops?: number;
};

export type KimtenAgent = {
  play(input: string, schema?: null, context?: Record<string, unknown> | null): Promise<string>;
  play<S extends ZodTypeAny>(
    input: string,
    schema: S,
    context?: Record<string, unknown> | null
  ): Promise<ZodInfer<S>>;
  forget(): void;
};

export declare function Kimten(config: KimtenConfig): KimtenAgent;

declare const _default: typeof Kimten;
export default _default;
