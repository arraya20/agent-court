import { afterEach, describe, expect, it } from "vitest";
import { buildDeploymentArgs, deploymentNetwork, parseDeploymentResult } from "@/deploy/config";

describe("deployment configuration", () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = originalEnvironment;
  });

  function configureParties() {
    process.env.GENLAYER_AGENT_COURT_BUYER = "0x33445abc8b75f285cfb83088abada08a288561fd";
    process.env.GENLAYER_AGENT_COURT_SELLER = "0x2c8b4f1e9d0a3c5b7e6f8a2d4c1b3e5f7a9c0e04";
    process.env.GENLAYER_AGENT_COURT_DESIGNATED = "0x9f0c2e4b6a8d1f3e5c7b9a0d2f4e6c8b0a1d3b12";
    process.env.GENLAYER_AGENT_COURT_ESCROW = "120";
  }

  it("uses configured buyer, seller, designated opener, and escrow", () => {
    configureParties();
    const args = buildDeploymentArgs();
    expect(args[2]).toBe("0x33445abc8b75f285cfb83088abada08a288561fd");
    expect(args[3]).toBe("0x2c8b4f1e9d0a3c5b7e6f8a2d4c1b3e5f7a9c0e04");
    expect(args[4]).toBe("0x9f0c2e4b6a8d1f3e5c7b9a0d2f4e6c8b0a1d3b12");
    expect(args[5]).toBe(120n);
  });

  it("defaults the designated opener to zero address when omitted", () => {
    configureParties();
    delete process.env.GENLAYER_AGENT_COURT_DESIGNATED;
    const args = buildDeploymentArgs();
    expect(args[4]).toBe("0x0000000000000000000000000000000000000000");
  });

  it("rejects missing or malformed party addresses", () => {
    for (const name of ["GENLAYER_AGENT_COURT_BUYER", "GENLAYER_AGENT_COURT_SELLER"]) {
      configureParties();
      delete process.env[name];
      expect(() => buildDeploymentArgs()).toThrow(name);
      process.env[name] = "0xinvalid";
      expect(() => buildDeploymentArgs()).toThrow(name);
    }
  });

  it("rejects identical buyer and seller addresses", () => {
    configureParties();
    process.env.GENLAYER_AGENT_COURT_SELLER = process.env.GENLAYER_AGENT_COURT_BUYER!;
    expect(() => buildDeploymentArgs()).toThrow("must differ");
  });

  it("builds constructor arguments with canonical obligations and GEN escrow", () => {
    configureParties();
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
