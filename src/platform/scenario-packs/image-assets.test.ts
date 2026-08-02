import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inspectScenarioImage,
  ScenarioImageError,
} from "./image-assets";

describe("scenario image inspection", () => {
  it("derives the authentic WebP dimensions and digest", () => {
    const bytes = new Uint8Array(
      readFileSync(
        resolve(
          process.cwd(),
          "public/media/staff/producer-manager.webp",
        ),
      ),
    );
    expect(inspectScenarioImage(bytes, "producer-manager.webp")).toEqual({
      originalFileName: "producer-manager.webp",
      sha256:
        "e12d002f111b56d9f8209db549c8fd58bc183e4f68f8478b182cbff3a853f616",
      byteLength: 35_106,
      width: 480,
      height: 600,
      mimeType: "image/webp",
      extension: "webp",
    });
  });

  it("recognizes bounded PNG and JPEG dimensions", () => {
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const jpeg = Uint8Array.from(
      Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
        "base64",
      ),
    );
    expect(inspectScenarioImage(png, "pixel.png")).toMatchObject({
      width: 1,
      height: 1,
      mimeType: "image/png",
      extension: "png",
    });
    expect(inspectScenarioImage(jpeg, "pixel.jpg")).toMatchObject({
      width: 1,
      height: 1,
      mimeType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("rejects unsupported, oversized, or misleading files", () => {
    expect(() => inspectScenarioImage(new Uint8Array([1, 2, 3]), "x.gif"))
      .toThrow(ScenarioImageError);
    expect(() =>
      inspectScenarioImage(
        new Uint8Array(5 * 1024 * 1024 + 1),
        "large.png",
      ),
    ).toThrow(/5 MiB/u);
    const webp = new Uint8Array(
      readFileSync(
        resolve(
          process.cwd(),
          "public/media/staff/producer-manager.webp",
        ),
      ),
    );
    expect(() => inspectScenarioImage(webp, "portrait.png")).toThrow(
      /extension/u,
    );
  });
});
