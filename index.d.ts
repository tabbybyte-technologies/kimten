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

export type KimtenConfig<S extends ZodTypeAny | undefined = undefined> = {
  brain: BrainModel;
  toys?: Toys;
  personality?: string;
  hops?: number;
  box?: S;
};

export type KimtenAgent<Out = string> = {
  play(input: string, context?: Record<string, unknown> | null): Promise<Out>;
  forget(): void;
};

export declare function Kimten<S extends ZodTypeAny | undefined = undefined>(
  config: KimtenConfig<S>
): KimtenAgent<S extends ZodTypeAny ? ZodInfer<S> : string>;

declare const _default: typeof Kimten;
export default _default;
