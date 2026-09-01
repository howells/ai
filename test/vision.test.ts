import { describe, expect, test } from "bun:test";
import { imagePart, visionMessage, visionPrompt } from "../src";

describe("vision helpers", () => {
  test("normalizes URL strings into AI SDK file parts", () => {
    const part = imagePart("https://example.com/screenshot.png");

    expect(part).toEqual({
      data: new URL("https://example.com/screenshot.png"),
      mediaType: "image",
      type: "file",
    });
  });

  test("extracts base64 data and infers image media type from data urls", () => {
    const part = imagePart("data:image/png;base64,abc123");

    expect(part).toEqual({
      data: "abc123",
      mediaType: "image/png",
      type: "file",
    });
  });

  test("extracts base64 data from URL object data urls", () => {
    expect(imagePart(new URL("data:image/webp;base64,abc123"))).toEqual({
      data: "abc123",
      mediaType: "image/webp",
      type: "file",
    });
  });

  test("normalizes mixed-case image data urls", () => {
    expect(imagePart("DATA:IMAGE/PNG;BASE64,abc123")).toEqual({
      data: "abc123",
      mediaType: "image/png",
      type: "file",
    });
  });

  test("rejects non-base64 image data urls", () => {
    expect(() => imagePart("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")).toThrow(
      "Image data URLs must use base64 encoding.",
    );
  });

  test("preserves explicit media type for binary data", () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(imagePart({ data, mediaType: "image/jpeg" })).toEqual({
      data,
      mediaType: "image/jpeg",
      type: "file",
    });
  });

  test("builds a text plus image prompt for generateText and streamText", () => {
    const prompt = visionPrompt("Describe this image.", [
      { mediaType: "image/webp", url: "https://example.com/image.webp" },
    ]);

    expect(prompt).toEqual([
      { text: "Describe this image.", type: "text" },
      {
        data: new URL("https://example.com/image.webp"),
        mediaType: "image/webp",
        type: "file",
      },
    ]);
  });

  test("builds a user message for AI SDK multimodal calls", () => {
    expect(visionMessage("Describe this image.", ["https://example.com/a.png"])).toEqual({
      content: [
        { text: "Describe this image.", type: "text" },
        { data: new URL("https://example.com/a.png"), mediaType: "image", type: "file" },
      ],
      role: "user",
    });
  });
});
