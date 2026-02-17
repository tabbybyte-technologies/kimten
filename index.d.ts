import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import type { Buffer } from 'node:buffer';

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
  name?: string;
  personality?: string;
  hops?: number;
  box?: S;
};

export type KimtenAgent<Out = string> = {
  name?: string;
  play(input: string, context?: Record<string, unknown> | null, options?: PlayOptions): Promise<Out>;
  forget(): void;
};

export type KimtenAttachmentSource = string | URL | Buffer | Uint8Array | ArrayBuffer;

export type KimtenAttachment =
  | {
      kind: 'image';
      image: KimtenAttachmentSource;
      mediaType?: string;
    }
  | {
      kind: 'file';
      data: KimtenAttachmentSource;
      mediaType: string;
      filename?: string;
    };

export type PlayOptions = {
  attachments?: KimtenAttachment[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
};

export declare function Kimten<S extends ZodTypeAny | undefined = undefined>(
  config: KimtenConfig<S>
): KimtenAgent<S extends ZodTypeAny ? ZodInfer<S> : string>;

declare const _default: typeof Kimten;
export default _default;
