import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();

vi.mock("genlayer-js", () => ({ createClient: () => ({ readContract, writeContract, waitForTransactionReceipt }) }));
vi.mock("genlayer-js/chains", () => ({
  localnet: { id: 1 },
  studionet: { id: 2 },
  testnetAsimov: { id: 3 },
  testnetBradbury: { id: 4221 }
}));

const original = { ...process.env };

function configure() {
  process.env.NEXT_PUBLIC_GENLAYER_NETWORK = "bradbury";
  process.env.NEXT_PUBLIC_AGENT_COURT_ADDRESS = "0x69F035f4D24E6631235A737ADD9860f4b1A1d4C4";
  process.env.NEXT_PUBLIC_AGENT_COURT_SCHEMA_VERSION = "2";
  process.env.NEXT_PUBLIC_AGENT_COURT_NETWORK_ID = "4221";
}

const loadModule = () => import("@/lib/genlayer");

describe("GenLayer adapter", () => {
  beforeEach(() => {
    configure();
    readContract.mockReset();
    writeContract.mockReset();
    waitForTransactionReceipt.mockReset();
  });

  afterEach(() => {
    process.env = original;
  });

  it("requires schema version 2 before writes", async () => {
    process.env.NEXT_PUBLIC_AGENT_COURT_SCHEMA_VERSION = "1";
    const { assertWritableCourt, configuredSchemaVersion } = await loadModule();
    expect(() => configuredSchemaVersion()).toThrow("schema version 2");
    expect(() => assertWritableCourt()).toThrow("schema version 2");
    process.env.NEXT_PUBLIC_AGENT_COURT_SCHEMA_VERSION = "2";
    expect((await loadModule()).configuredSchemaVersion()).toBe(2);
  });

  it("rejects writes when the configured network is mismatched", async () => {
    process.env.NEXT_PUBLIC_AGENT_COURT_NETWORK_ID = "999";
    const { assertWritableCourt } = await loadModule();
    expect(() => assertWritableCourt()).toThrow("does not match configured GenLayer network");
    process.env.NEXT_PUBLIC_AGENT_COURT_NETWORK_ID = "4221";
    const valid = await loadModule();
    expect(() => valid.assertWritableCourt()).not.toThrow();
  });

  it("sends adjudication without a client-controlled payload", async () => {
    const { requestAdjudication } = await loadModule();
    writeContract.mockResolvedValue("0xtx");
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", resultName: "SUCCESS", txExecutionResultName: "FINISHED_WITH_RETURN" });
    await requestAdjudication();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "adjudicate", args: [] }));
  });

  it("hashes public evidence locally before submission", async () => {
    const { addEvidence } = await loadModule();
    const text = "Public delivery record";
    writeContract.mockResolvedValue("0xtx");
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", resultName: "SUCCESS", txExecutionResultName: "FINISHED_WITH_RETURN" });
    const { sha256Hex } = await loadModule();
    const hash = await sha256Hex(text);
    await addEvidence({ type: "delivery", hash, source: "https://example.org/report", visibility: "public", text });
    const call = writeContract.mock.calls[0][0];
    expect(call.functionName).toBe("add_evidence");
    expect(call.args[1]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(call.args[4]).toBe(text);
  });

  it("reads the configured contract state", async () => {
    const { readCourtState } = await loadModule();
    readContract.mockResolvedValue({ schema_version: 2, state: "draft" });
    await readCourtState("0x69F035f4D24E6631235A737ADD9860f4b1A1d4C4");
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "get_case" }));
  });

  it("requires FINALIZED and SUCCESS receipts", async () => {
    const { waitForCourtTransaction } = await loadModule();
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", resultName: "FAILURE" });
    const hash = `0x${"ab".repeat(32)}` as Parameters<typeof waitForCourtTransaction>[0];
    await expect(waitForCourtTransaction(hash)).rejects.toThrow("Transaction failed (FAILURE)");
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", resultName: "SUCCESS", txExecutionResultName: "FINISHED_WITH_ERROR" });
    await expect(waitForCourtTransaction(hash)).rejects.toThrow("FINISHED_WITH_ERROR");
  });

  it("uses the no-payload settle action", async () => {
    const { executeCourtAction, settleCourt } = await loadModule();
    writeContract.mockResolvedValue("0xtx");
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", resultName: "SUCCESS", txExecutionResultName: "FINISHED_WITH_RETURN" });
    await settleCourt();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "settle", args: [] }));
    await executeCourtAction("settle");
    expect(writeContract).toHaveBeenCalledTimes(2);
  });
});
