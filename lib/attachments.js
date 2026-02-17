import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { isPlainObject } from './guards.js';

function isAttachmentSource(value) {
  if (typeof value === 'string') {
    return true;
  }

  if (value instanceof URL) {
    return true;
  }

  if (Buffer.isBuffer(value)) {
    return true;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return true;
  }

  return false;
}

function toCandidateLocalPath(value) {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('data:') || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

async function tryReadLocalFile(value) {
  const path = toCandidateLocalPath(value);
  if (!path) {
    return null;
  }

  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return null;
    }

    return {
      bytes: await readFile(path),
      path,
    };
  } catch {
    return null;
  }
}

function normalizeImageAttachment(attachment, index) {
  if (!isAttachmentSource(attachment.image)) {
    throw new TypeError(
      `Kimten play(input, context, options) image attachment at index ${index} must include "image" as string, URL, Buffer, Uint8Array, or ArrayBuffer.`
    );
  }

  if (attachment.mediaType !== undefined && typeof attachment.mediaType !== 'string') {
    throw new TypeError(
      `Kimten play(input, context, options) image attachment at index ${index} has invalid "mediaType" (string expected).`
    );
  }

  if (typeof attachment.mediaType === 'string' && attachment.mediaType.trim() === '') {
    throw new TypeError(
      `Kimten play(input, context, options) image attachment at index ${index} has invalid "mediaType" (non-empty string expected).`
    );
  }

  return {
    type: 'image',
    image: attachment.image,
    ...(attachment.mediaType ? { mediaType: attachment.mediaType.trim() } : {}),
  };
}

function normalizeFileAttachment(attachment, index) {
  if (!isAttachmentSource(attachment.data)) {
    throw new TypeError(
      `Kimten play(input, context, options) file attachment at index ${index} must include "data" as string, URL, Buffer, Uint8Array, or ArrayBuffer.`
    );
  }

  if (typeof attachment.mediaType !== 'string' || attachment.mediaType.trim() === '') {
    throw new TypeError(
      `Kimten play(input, context, options) file attachment at index ${index} must include a non-empty "mediaType" string.`
    );
  }

  if (attachment.filename !== undefined && typeof attachment.filename !== 'string') {
    throw new TypeError(
      `Kimten play(input, context, options) file attachment at index ${index} has invalid "filename" (string expected).`
    );
  }

  if (typeof attachment.filename === 'string' && attachment.filename.trim() === '') {
    throw new TypeError(
      `Kimten play(input, context, options) file attachment at index ${index} has invalid "filename" (non-empty string expected).`
    );
  }

  return {
    type: 'file',
    data: attachment.data,
    mediaType: attachment.mediaType.trim(),
    ...(attachment.filename ? { filename: attachment.filename.trim() } : {}),
  };
}

function normalizeAttachment(attachment, index) {
  if (!isPlainObject(attachment)) {
    throw new TypeError(`Kimten play(input, context, options) attachment at index ${index} must be a plain object.`);
  }

  if (attachment.kind === 'image') {
    return normalizeImageAttachment(attachment, index);
  }

  if (attachment.kind === 'file') {
    return normalizeFileAttachment(attachment, index);
  }

  throw new TypeError(
    `Kimten play(input, context, options) attachment at index ${index} has invalid "kind". Expected "image" or "file".`
  );
}

export function normalizeAttachmentsOption(value) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError('Kimten play(input, context, options) option "attachments" must be an array when provided.');
  }

  return value.map((attachment, index) => normalizeAttachment(attachment, index));
}

export async function resolveAttachmentPayloads(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.type === 'image' && typeof attachment.image === 'string') {
        const local = await tryReadLocalFile(attachment.image);
        if (local) {
          return {
            ...attachment,
            image: local.bytes,
          };
        }
      }

      if (attachment.type === 'file' && typeof attachment.data === 'string') {
        const local = await tryReadLocalFile(attachment.data);
        if (local) {
          return {
            ...attachment,
            data: local.bytes,
            ...(attachment.filename ? {} : { filename: basename(local.path) }),
          };
        }
      }

      return attachment;
    })
  );
}
