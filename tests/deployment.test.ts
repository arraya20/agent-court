import { describe, expect, it } from "vitest";
import { buildDeploymentArgs, deploymentNetwork, parseDeploymentResult } from "@/deploy/config";

describe("deployment configuration", () => {
  it("uses the configured buyer wallet and escrow amount", () => {
    const originalBuyer = process.env.GENLAYER_AGENT_COURT_BUYER;
    const originalEscrow = process.env.GENLAYER_AGENT_COURT_ESCROW;
    process.env.GENLAYER_AGENT_COURT_BUYER = "0x33445abc8b75f285cfb83088abada08a288561fd";
    process.env.GENLAYER_AGENT_COURT_ESCROW = "120";
    const args = buildDeploymentArgs();
    expect(args[2]).toBe("0x33445abc8b75f285cfb83088abada08a288561fd");
    expect(args[5]).toBe(120n);
    if (originalBuyer === undefined) delete process.env.GENLAYER_AGENT_COURT_BUYER;
    else process.env.GENLAYER_AGENT_COURT_BUYER = originalBuyer;
    if (originalEscrow === undefined) delete process.env.GENLAYER_AGENT_COURT_ESCROW;
    else process.env.GENLAYER_AGENT_COURT_ESCROW = originalEscrow;
  });

  it("rejects a missing or malformed buyer wallet", () => {
    const originalBuyer = process.env.GENLAYER_AGENT_COURT_BUYER;
    delete process.env.GENLAYER_AGENT_COURT_BUYER;
    expect(() => buildDeploymentArgs()).toThrow("GENLAYER_AGENT_COURT_BUYER");
    process.env.GENLAYER_AGENT_COURT_BUYER = "0xinvalid";
    expect(() => buildDeploymentArgs()).toThrow("GENLAYER_AGENT_COURT_BUYER");
    if (originalBuyer === undefined) delete process.env.GENLAYER_AGENT_COURT_BUYER;
    else process.env.GENLAYER_AGENT_COURT_BUYER = originalBuyer;
  });

  it("builds constructor arguments with canonical obligations and GEN escrow", () => {
    process.env.GENLAYER_AGENT_COURT_BUYER = "0x33445abc8b75f285cfb83088abada08a288561fd";
    process.env.GENLAYER_AGENT_COURT_ESCROW = "120";
    const args = buildDeploymentArgs();
    expect(args).toHaveLength(7);
    expect(JSON.parse(args[6] as string).reduce((total: number, item: { weight_bps: number }) => total + item.weight_bps, 0)).toBe(10000);
    expect(args[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.parse(args[6] as string)).toEqual([
      expect.objectContaining({ id: "OB-1", acceptance_criteria: expect.any(String) }),
      expect.objectContaining({ id: "OB-2", remedy: expect.any(String) })
    ]);
  });

  it("rejects unsupported deployment networks", () => {
    expect(deploymentNetwork("studionet")).toBe("studionet");
    expect(deploymentNetwork("testnet-asimov")).toBe("testnet-asimov");
    expect(() => deploymentNetwork("mainnet")).toThrow("Unsupported deployment network: mainnet");
  });

  it("accepts the supported deployment networks", () => {
    expect(deploymentNetwork("localnet")).toBe("localnet");
    expect(deploymentNetwork("studionet")).toBe("studionet");
    expect(deploymentNetwork("testnet-asimov")).toBe("testnet-asimov");
    expect(deploymentNetwork("testnet-bradbury")).toBe("testnet-bradbury");
  });

  it("requires a contract address before writing a deployment manifest", () => {
    expect(parseDeploymentResult({ txId: "0xabc", contractAddress: "0x123", network: "studionet" })).toEqual({
      txId: "0xabc",
      contractAddress: "0x123",
      network: "studionet"
    });
    expect(() => parseDeploymentResult({ txId: "0xabc", contractAddress: "", network: "studionet" })).toThrow("Deployment finalized without a contract address.");
  });
});
