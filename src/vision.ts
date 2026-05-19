import type { ImagePart, TextPart, UserModelMessage } from "ai";

export type VisionImageData = string | URL | Uint8Array | ArrayBuffer | Buffer;

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

export type VisionPrompt = Array<TextPart | ImagePart>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeImageData(value: VisionImageData): VisionImageData {
  if (typeof value !== "string") return value;

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    // Plain strings are treated as base64/data-url payloads by the AI SDK.
  }

  return value;
}

function mediaTypeFromDataUrl(value: VisionImageData): `image/${string}` | undefined {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    return undefined;
  }
  const [header] = value.split(",", 1);
  const mediaType = header?.slice("data:".length).split(";")[0];
  return mediaType?.startsWith("image/")
    ? (mediaType as `image/${string}`)
    : undefined;
}

export function imagePart(input: VisionInput): ImagePart {
  if (isRecord(input)) {
    if ("url" in input) {
      const image = normalizeImageData(input.url as string | URL);
      return {
        type: "image",
        image,
        mediaType:
          (input.mediaType as `image/${string}` | undefined) ??
          mediaTypeFromDataUrl(image),
      };
    }

    if ("data" in input) {
      const image = normalizeImageData(input.data as VisionImageData);
      return {
        type: "image",
        image,
        mediaType:
          (input.mediaType as `image/${string}` | undefined) ??
          mediaTypeFromDataUrl(image),
      };
    }
  }

  const image = normalizeImageData(input);
  return {
    type: "image",
    image,
    mediaType: mediaTypeFromDataUrl(image),
  };
}

export function visionPrompt(text: string, images: readonly VisionInput[]): VisionPrompt {
  return [
    { type: "text", text },
    ...images.map((image) => imagePart(image)),
  ];
}

export function visionMessage(
  text: string,
  images: readonly VisionInput[],
): UserModelMessage {
  return {
    role: "user",
    content: visionPrompt(text, images),
  };
}
