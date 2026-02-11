import type { ZodTypeAny, infer as ZodInfer } from 'zod';

export type BrainModel = Record<string, unknown>;

export type ToyFn = (args: any) => any | Promise<any>;

export type ToyDefinition = {
  inputSchema?: ZodTypeAny;
  description?: string;
  strict?: boolean;
  execute: ToyFn;
};

export type Toys = Record<string, ToyFn | ToyDefinition>;

export type KimtenConfig = {
  brain: BrainModel;
  toys?: Toys;
  personality?: string;
  hops?: number;
};

export type KimtenAgent = {
  play(input: string): Promise<string>;
  play<S extends ZodTypeAny>(input: string, schema: S): Promise<ZodInfer<S>>;
  forget(): void;
};

export declare function Kimten(config: KimtenConfig): KimtenAgent;

declare const _default: typeof Kimten;
export default _default;

