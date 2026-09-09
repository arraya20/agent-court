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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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
  const buyer = requiredAddress("GENLAYER_AGENT_COURT_BUYER");
  const seller = requiredAddress("GENLAYER_AGENT_COURT_SELLER");
  const designated = optionalAddress("GENLAYER_AGENT_COURT_DESIGNATED") ?? ZERO_ADDRESS;
  if (buyer.toLowerCase() === seller.toLowerCase()) throw new Error("GENLAYER_AGENT_COURT_BUYER and GENLAYER_AGENT_COURT_SELLER must differ.");
  const escrow = process.env.GENLAYER_AGENT_COURT_ESCROW ?? "120";
  if (!/^\d+$/.test(escrow) || BigInt(escrow) <= 0n) {
    throw new Error("GENLAYER_AGENT_COURT_ESCROW must be a positive integer amount in GEN.");
  }
  const agreementHash = keccak256(stringToHex(canonicalizeContract({ buyer, designated, obligations, seller, terms, version: "v1" })));
  return [agreementHash, terms, buyer, seller, designated, BigInt(escrow), JSON.stringify(obligations)];
}

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid wallet address.`);
  }
  return value;
}

function optionalAddress(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be empty or a valid wallet address.`);
  }
  return value;
}

export function parseDeploymentResult(input: { txId: string; contractAddress?: string; network: string }) {
  if (!input.contractAddress) throw new Error("Deployment finalized without a contract address.");
  return { txId: input.txId, contractAddress: input.contractAddress, network: input.network };
}
