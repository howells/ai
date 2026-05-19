import { describe, expect, test } from "bun:test";
import { imagePart, visionMessage, visionPrompt } from "../src";

describe("vision helpers", () => {
  test("normalizes URL strings into AI SDK image parts", () => {
    const part = imagePart("https://example.com/screenshot.png");

    expect(part.type).toBe("image");
    expect(part.image).toBeInstanceOf(URL);
    expect(String(part.image)).toBe("https://example.com/screenshot.png");
  });

  test("keeps data urls and infers image media type", () => {
    const part = imagePart("data:image/png;base64,abc123");

    expect(part).toEqual({
      type: "image",
      image: "data:image/png;base64,abc123",
      mediaType: "image/png",
    });
  });

  test("preserves explicit media type for binary data", () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(imagePart({ data, mediaType: "image/jpeg" })).toEqual({
      type: "image",
      image: data,
      mediaType: "image/jpeg",
    });
  });

  test("builds a text plus image prompt for generateText and streamText", () => {
    const prompt = visionPrompt("Describe this image.", [
      { url: "https://example.com/image.webp", mediaType: "image/webp" },
    ]);

    expect(prompt).toEqual([
      { type: "text", text: "Describe this image." },
      {
        type: "image",
        image: new URL("https://example.com/image.webp"),
        mediaType: "image/webp",
      },
    ]);
  });

  test("builds a user message for AI SDK multimodal calls", () => {
    expect(visionMessage("Describe this image.", ["https://example.com/a.png"])).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Describe this image." },
        { type: "image", image: new URL("https://example.com/a.png") },
      ],
    });
  });
});
