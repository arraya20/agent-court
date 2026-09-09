import { existsSync, readFileSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { canonicalizeContract } from "@/lib/court";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();

const seller = "0x2c8b4f1e9d0a3c5b7e6f8a2d4c1b3e5f7a9c0e04";
const designated = "0x9f0c2e4b6a8d1f3e5c7b9a0d2f4e6c8b0a1d3b12";
const terms = "Seller must deliver a professionally written market report with at least 95% coverage of the approved source list. Conclusions must be grounded in cited evidence.";
const obligations = [
  { id: "OB-1", clause: "Cover the approved source list comprehensively", acceptance_criteria: "At least 95% source coverage", remedy: "Fixed 60% quality tranche", weight_bps: 6000 },
  { id: "OB-2", clause: "Provide professionally written, evidence-backed analysis", acceptance_criteria: "Independent review confirms material claims are grounded in cited sources", remedy: "Fixed 40% quality tranche", weight_bps: 4000 }
];

export type DeploymentNetwork = "localnet" | "studionet" | "testnet-asimov" | "testnet-bradbury";

export function deploymentNetwork(value: string | undefined): DeploymentNetwork {
  const network = value ?? "localnet";
  if (network === "localnet" || network === "studionet" || network === "testnet-asimov" || network === "testnet-bradbury") return network;
  throw new Error(`Unsupported deployment network: ${network}`);
}

export function buildDeploymentArgs(): [string, string, string, string, string, bigint, string] {
  const buyer = process.env.GENLAYER_AGENT_COURT_BUYER;
  if (typeof buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(buyer)) {
    throw new Error("GENLAYER_AGENT_COURT_BUYER must be a valid wallet address.");
  }
  const escrow = process.env.GENLAYER_AGENT_COURT_ESCROW ?? "120";
  if (!/^\d+$/.test(escrow) || BigInt(escrow) <= 0n) {
    throw new Error("GENLAYER_AGENT_COURT_ESCROW must be a positive integer amount in GEN.");
  }
  const agreementHash = keccak256(stringToHex(canonicalizeContract({ buyer, designated, obligations, seller, terms, version: "v1" })));
  return [agreementHash, terms, buyer, seller, designated, BigInt(escrow), JSON.stringify(obligations)];
}

export function parseDeploymentResult(input: { txId: string; contractAddress?: string; network: string }) {
  if (!input.contractAddress) throw new Error("Deployment finalized without a contract address.");
  return { txId: input.txId, contractAddress: input.contractAddress, network: input.network };
}
