import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicImages = [
  {
    path: "images/icon.png",
    readmeReference: false,
    square: true,
  },
  {
    path: "images/tooltip.png",
    readmeReference: true,
    square: false,
  },
  {
    path: "images/session-cookie.png",
    readmeReference: true,
    square: false,
  },
];

function readPngDimensions(path: string): { height: number; width: number } {
  const image = readFileSync(resolve(path));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  expect(image.subarray(0, pngSignature.length)).toEqual(pngSignature);

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe("public extension images", () => {
  it.each(publicImages)("$path is a valid, usable PNG", image => {
    const dimensions = readPngDimensions(image.path);

    expect(dimensions.width).toBeGreaterThanOrEqual(128);
    expect(dimensions.height).toBeGreaterThanOrEqual(128);

    if (image.square) {
      expect(dimensions.width).toBe(dimensions.height);
    }
  });

  it("keeps Marketplace image paths referenced by the README", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");

    for (const image of publicImages.filter(image => image.readmeReference)) {
      expect(readme).toContain(`](${image.path})`);
    }
  });
});
