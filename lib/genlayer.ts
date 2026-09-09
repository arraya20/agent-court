import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import type { Address } from "viem";

const networkName = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";
const networks = {
  localnet,
  studionet,
  "testnet-asimov": testnetAsimov,
  asimov: testnetAsimov,
  bradbury: testnetBradbury,
  "testnet-bradbury": testnetBradbury
} as const;

const network = networks[networkName as keyof typeof networks];
if (!network) throw new Error(`Unsupported GenLayer network: ${networkName}`);

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

export function getGenLayerClient() {
  return createClient({ chain: network, provider: typeof window === "undefined" ? undefined : window.ethereum });
}

export interface ContractState {
  schema_version: number;
  agreement_hash: string;
  terms: string;
  buyer: string;
  seller: string;
  designated_opener: string;
  escrow_amount: string;
  state: "draft" | "funded" | "disputed" | "resolved" | "settlement_queued";
  dispute_reason: string;
  buyer_bps: number;
  seller_bps: number;
  ruling_summary: string;
  settlement_started: boolean;
  obligations: Array<{
    id: string;
    clause: string;
    acceptance_criteria: string;
    remedy: string;
    weight_bps: number;
    status: "pending" | "met" | "breached" | "inconclusive";
    reasoning: string;
    evidence_refs: string[];
    buyer_bps: number;
    seller_bps: number;
  }>;
  evidence: Array<{ id: string; type: string; hash: string; source: string; submitted_by: string; visibility: "public" | "private" | "redacted"; text: string }>;
}

export function configuredContractAddress(): Address {
  const value = process.env.NEXT_PUBLIC_AGENT_COURT_ADDRESS;
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error("NEXT_PUBLIC_AGENT_COURT_ADDRESS is not configured with a valid contract address.");
  }
  return value as Address;
}

export function configuredSchemaVersion(): number {
  const value = Number(process.env.NEXT_PUBLIC_AGENT_COURT_SCHEMA_VERSION ?? 2);
  if (!Number.isInteger(value) || value !== 2) throw new Error("Agent Court requires contract schema version 2.");
  return value;
}

export function isNetworkConfigured(): boolean {
  const value = process.env.NEXT_PUBLIC_AGENT_COURT_NETWORK_ID;
  return value === undefined || Number(value) === network.id;
}

export function assertWritableCourt(): void {
  configuredContractAddress();
  configuredSchemaVersion();
  if (!isNetworkConfigured()) throw new Error(`Connected network does not match configured GenLayer network ${network.id}.`);
}

export async function connectWallet(): Promise<Address> {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("No compatible wallet detected.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Wallet did not return a valid address.");
  return address as Address;
}

export async function writeCourtAction(functionName: string, args: string[] = [], value = 0n) {
  assertWritableCourt();
  return getGenLayerClient().writeContract({ address: configuredContractAddress(), functionName, args, value });
}

export async function executeCourtAction(functionName: string, args: string[] = []) {
  const hash = await writeCourtAction(functionName, args);
  return waitForCourtTransaction(hash as TransactionHash);
}

export async function openDispute(reason: string) {
  return executeCourtAction("open_dispute", [reason]);
}

export async function addEvidence(input: { type: string; hash: string; source: string; visibility: string; text: string }) {
  return executeCourtAction("add_evidence", [input.type, input.hash, input.source, input.visibility, input.text]);
}

export async function readCourtState(contractAddress: Address): Promise<ContractState> {
  const result = await getGenLayerClient().readContract({ address: contractAddress, functionName: "get_case", args: [] }) as unknown;
  if (!result || typeof result !== "object" || !("schema_version" in result)) throw new Error("Contract did not return Agent Court state.");
  return result as ContractState;
}

export async function requestAdjudication() {
  return executeCourtAction("adjudicate");
}

export async function fundCourt() {
  const hash = await writeCourtAction("fund", [], BigInt(process.env.NEXT_PUBLIC_AGENT_COURT_ESCROW ?? "120"));
  return waitForCourtTransaction(hash as TransactionHash);
}

export async function settleCourt() {
  return executeCourtAction("settle");
}

export async function acceptCourt() {
  return executeCourtAction("accept");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function waitForCourtTransaction(hash: TransactionHash) {
  const receipt = await getGenLayerClient().waitForTransactionReceipt({ hash, retries: 200, interval: 1500 }) as { statusName?: string; resultName?: string; txExecutionResultName?: string };
  if (receipt.statusName !== "FINALIZED") throw new Error(`Transaction did not finalize (${receipt.statusName}).`);
  if (receipt.resultName !== "SUCCESS") throw new Error(`Transaction failed (${receipt.resultName}).`);
  if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error(`Transaction failed (${receipt.txExecutionResultName ?? "UNKNOWN"}).`);
  return receipt;
}
