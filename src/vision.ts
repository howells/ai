import type { FilePart, TextPart, UserModelMessage } from "ai";

/** Image payload shape accepted by the package vision helpers. */
export type VisionImageData = string | URL | Uint8Array | ArrayBuffer | Buffer;

/** Image input accepted by visionPrompt and visionMessage. */
export type VisionInput =
  | VisionImageData
  | {
      data: VisionImageData;
      mediaType?: `image/${string}`;
    }
  | {
      url: string | URL;
      mediaType?: `image/${string}`;
    };

/** AI SDK multimodal prompt content built from text plus image parts. */
export type VisionPrompt = (TextPart | FilePart)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeImageData(value: VisionImageData): VisionImageData {
  if (typeof value !== "string") {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {
    // Plain strings are treated as base64/data-url payloads by the AI SDK.
  }

  return value;
}

function imageDataUrl(value: VisionImageData): string | undefined {
  const serialized = value instanceof URL ? value.href : value;
  return typeof serialized === "string" && serialized.toLowerCase().startsWith("data:image/")
    ? serialized
    : undefined;
}

function mediaTypeFromDataUrl(value: VisionImageData): `image/${string}` | undefined {
  const dataUrl = imageDataUrl(value);
  if (dataUrl === undefined) {
    return undefined;
  }
  const [header] = dataUrl.split(",", 1);
  const mediaType = header?.slice("data:".length).split(";")[0]?.toLowerCase();
  return mediaType?.startsWith("image/") ? (mediaType as `image/${string}`) : undefined;
}

function fileData(value: VisionImageData): VisionImageData {
  const dataUrl = imageDataUrl(value);
  if (dataUrl !== undefined) {
    const separator = dataUrl.indexOf(",");
    if (separator === -1) {
      throw new Error("Invalid image data URL.");
    }
    const header = dataUrl.slice(0, separator);
    if (!header.toLowerCase().split(";").includes("base64")) {
      throw new Error("Image data URLs must use base64 encoding.");
    }
    return dataUrl.slice(separator + 1);
  }

  const normalized = normalizeImageData(value);
  return normalized;
}

/** Convert a supported image input into an AI SDK file content part. */
export function imagePart(input: VisionInput): FilePart {
  if (isRecord(input)) {
    if ("url" in input) {
      const data = fileData(input.url);
      return {
        data,
        mediaType: input.mediaType ?? mediaTypeFromDataUrl(input.url) ?? "image",
        type: "file",
      };
    }

    if ("data" in input) {
      const data = fileData(input.data);
      return {
        data,
        mediaType: input.mediaType ?? mediaTypeFromDataUrl(input.data) ?? "image",
        type: "file",
      };
    }
  }

  return {
    data: fileData(input),
    mediaType: mediaTypeFromDataUrl(input) ?? "image",
    type: "file",
  };
}

/** Build AI SDK user-message content from text and one or more images. */
export function visionPrompt(text: string, images: readonly VisionInput[]): VisionPrompt {
  return [{ text, type: "text" }, ...images.map((image) => imagePart(image))];
}

/** Build a complete AI SDK user message for multimodal generation calls. */
export function visionMessage(text: string, images: readonly VisionInput[]): UserModelMessage {
  return {
    content: visionPrompt(text, images),
    role: "user",
  };
}
