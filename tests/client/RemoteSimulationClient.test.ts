import { describe, expect, it, vi } from "vitest";
import { RemoteSimulationClient } from "../../src/client/RemoteSimulationClient";
import type { Transport } from "../../src/client/Transport";
import type { GameStartInfo } from "../../src/core/Schemas";
vi.mock("../../src/core/worker/WorkerClient", () => ({
  WorkerClient: class {},
}));
describe("server-authoritative rendering client", () => {
  it("coalesces repeated UI queries without starting a local simulation or exposing snapshots", async () => {
    const query = vi.fn().mockResolvedValue({ buildableUnits: [] });
    const receiver = vi.fn();
    const transport = {
      authoritativeQuery: query,
      setAuthoritativeReceiver: receiver,
    } as unknown as Transport;
    const client = new RemoteSimulationClient(
      {} as GameStartInfo,
      "test",
      transport,
    );
    await client.initialize();
    const first = client.playerInteraction("player");
    const second = client.playerInteraction("player");
    expect(await first).toEqual(await second);
    expect(query).toHaveBeenCalledTimes(1);
    await client.playerInteraction("player", 3, 4);
    expect(query).toHaveBeenCalledTimes(2);
    expect(() => client.sendTurn({} as never)).toThrow(
      "Replicated turns forbidden",
    );
    await expect(client.snapshot()).rejects.toThrow("Private server snapshots");
    client.cleanup();
    expect(receiver).toHaveBeenLastCalledWith(undefined);
    await client.playerInteraction("player");
    expect(query).toHaveBeenCalledTimes(3);
  });
});
