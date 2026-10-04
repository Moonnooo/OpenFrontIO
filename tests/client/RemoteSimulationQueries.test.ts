import { afterEach, expect, it, vi } from "vitest";
import { RemoteSimulationClient } from "../../src/client/RemoteSimulationClient";
import type { Transport } from "../../src/client/Transport";
import type { GameStartInfo } from "../../src/core/Schemas";
afterEach(() => vi.useRealTimers());
it("coalesces identical queries and paces distinct requests below the server limit", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValue({ relations: {}, alliances: [] });
  const transport = {
    authoritativeQuery: request,
    setAuthoritativeReceiver: vi.fn(),
  } as unknown as Transport;
  const client = new RemoteSimulationClient(
    {} as GameStartInfo,
    undefined,
    transport,
  );
  const first = client.playerProfile(1);
  const duplicate = client.playerProfile(1);
  const next = client.playerProfile(2);
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(49);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(request).toHaveBeenCalledTimes(2);
  await expect(first).resolves.toEqual(await duplicate);
  await next;
  client.cleanup();
});
it("continues queued requests after a rejected query", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue({ relations: {}, alliances: [] });
  const transport = {
    authoritativeQuery: request,
    setAuthoritativeReceiver: vi.fn(),
  } as unknown as Transport;
  const client = new RemoteSimulationClient(
    {} as GameStartInfo,
    undefined,
    transport,
  );
  const failed = client.playerProfile(1).catch((e) => e.message);
  const next = client.playerProfile(2);
  await vi.advanceTimersByTimeAsync(50);
  expect(await failed).toBe("Unavailable");
  await expect(next).resolves.toEqual({ relations: {}, alliances: [] });
  expect(request).toHaveBeenCalledTimes(2);
  client.cleanup();
});
