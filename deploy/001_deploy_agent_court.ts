import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DecodedDeployData, GenLayerChain, GenLayerClient, TransactionHash } from "genlayer-js/types";
import { TransactionStatus } from "genlayer-js/types";
import { buildDeploymentArgs, deploymentNetwork, parseDeploymentResult } from "./config";

export default async function main(client: GenLayerClient<GenLayerChain>) {
  const network = deploymentNetwork(process.env.GENLAYER_DEPLOY_NETWORK);
  const code = new Uint8Array(readFileSync(new URL("../contracts/agent_court.py", import.meta.url)));
  const txId = await client.deployContract({ code, args: buildDeploymentArgs() }) as TransactionHash;
  console.log("Deployment submitted", { network, txId });

  const transaction = await client.waitForTransactionReceipt({
    hash: txId,
    status: TransactionStatus.FINALIZED,
    retries: 240,
    interval: 2_000
  });
  if (transaction.statusName !== TransactionStatus.FINALIZED) {
    throw new Error(`Deployment did not finalize: ${transaction.statusName ?? "unknown"}`);
  }
  const decoded = transaction.txDataDecoded as DecodedDeployData | undefined;
  const result = parseDeploymentResult({
    txId,
    contractAddress: decoded?.contractAddress ?? transaction.recipient,
    network
  });
  mkdirSync(new URL("../deployments", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../deployments/${network}.json`, import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log("Agent Court deployed", result);
  return result.contractAddress;
}
