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
      image: "data:image/png;base64,abc123",
      mediaType: "image/png",
      type: "image",
    });
  });

  test("preserves explicit media type for binary data", () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(imagePart({ data, mediaType: "image/jpeg" })).toEqual({
      image: data,
      mediaType: "image/jpeg",
      type: "image",
    });
  });

  test("builds a text plus image prompt for generateText and streamText", () => {
    const prompt = visionPrompt("Describe this image.", [
      { mediaType: "image/webp", url: "https://example.com/image.webp" },
    ]);

    expect(prompt).toEqual([
      { text: "Describe this image.", type: "text" },
      {
        image: new URL("https://example.com/image.webp"),
        mediaType: "image/webp",
        type: "image",
      },
    ]);
  });

  test("builds a user message for AI SDK multimodal calls", () => {
    expect(visionMessage("Describe this image.", ["https://example.com/a.png"])).toEqual({
      content: [
        { text: "Describe this image.", type: "text" },
        { image: new URL("https://example.com/a.png"), type: "image" },
      ],
      role: "user",
    });
  });
});
