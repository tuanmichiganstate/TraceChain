import { describe, expect, it } from "vitest";
import {
  MemorySimulationPersistence,
  persistBeforePublish,
  type SimulationPersistence,
} from "./simulation-persistence";

describe("transactional simulation persistence", () => {
  it("publishes only after the prospective state is durable", async () => {
    const order: string[] = [];
    const persistence: SimulationPersistence = {
      load: async () => null,
      persistAndCommit: async () => {
        order.push("persist");
      },
    };
    await persistBeforePublish({
      snapshot: { value: 1 },
      encode: () => {
        order.push("encode");
        return "TC3.payload.checksum";
      },
      persistence,
      publish: () => {
        order.push("publish");
      },
    });
    expect(order).toEqual(["encode", "persist", "publish"]);
  });

  it("does not publish after persistence failure", async () => {
    let published = false;
    await expect(
      persistBeforePublish({
        snapshot: { value: 1 },
        encode: () => "TC3.payload.checksum",
        persistence: {
          load: async () => null,
          persistAndCommit: async () => {
            throw new Error("commit failed");
          },
        },
        publish: () => {
          published = true;
        },
      }),
    ).rejects.toThrow("commit failed");
    expect(published).toBe(false);
  });

  it("memory persistence implements the same durable interface", async () => {
    const persistence = new MemorySimulationPersistence();
    await persistence.persistAndCommit("TC3.one.hash");
    expect(await persistence.load()).toBe("TC3.one.hash");
    expect(persistence.writeHistory).toEqual(["TC3.one.hash"]);
  });
});
