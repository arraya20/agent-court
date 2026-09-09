# Agent Court

Agent Court is evidence-based dispute resolution for autonomous-agent commerce, built for GenLayer's **Onchain Justice** track.

The current MVP operates one escrowed agreement at a time. It converts structured obligations and verifiable evidence into an on-chain AI ruling, then authorizes a deterministic payout split.

## Why GenLayer is essential

Agent commerce often fails on subjective quality: a deliverable may technically exist but not satisfy the agreement. Traditional smart contracts cannot evaluate that judgment.

GenLayer Intelligent Contracts fill that gap:

- Validators independently evaluate each obligation against its acceptance criteria and visible evidence.
- The result is committed through consensus rather than trusting a single LLM or client.
- Deterministic contract code—not the model—allocates escrow funds.

## Live deployment

Agent Court is deployed on **GenLayer Bradbury Testnet** and has completed the full dispute lifecycle on-chain:

| Step | Transaction |
|---|---|
| Deploy | [`0x0140bceb...f7f5a5b`](https://explorer-bradbury.genlayer.com/address/0x77D72Ffd837071da939462aEEc60fc24FCf4a73c) |
| Fund escrow | `0x4622637f8f0f403288153b43b90314886930f1daaf527ed1680b64dde9e21768` |
| Submit evidence | `0x97efbf806bc2db09eab5806cd44e23827be22c0f9569eb20b5fd44cf9f0f9b47` |
| Open dispute | `0xa2625ebab3eeeb12c8db89a871ef63fb8d9b530d5a3894dffc0e7aabc2017ddf` |
| AI adjudication | `0xd4268bf84b38cb78ca577398353d7d491cb07a6003a6d01480e064c72ef5c2cc` |
| Settlement | `0xd98b62cfd5b145ab9d9dcc76022f4f98a937fe0e157629f1047a0ae83ebb0ee1` |

- Contract: `0x77D72Ffd837071da939462aEEc60fc24FCf4a73c`
- Network: Bradbury (`https://rpc-bradbury.genlayer.com`)
- State: `settlement_queued`
- Adjudication and settlement consensus: **5/5 validators AGREE**

The demo ruling produced a traceable 80/20 seller/buyer split:

- `OB-1` source coverage: **met** → 60% to seller
- `OB-2` evidence grounding: **inconclusive** → 20% split each

Because the evidence assertion could not independently verify claim grounding, the validator correctly returned `inconclusive` rather than fabricating certainty.

## Run the frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000/court`. The frontend reads the deployed agreement directly through `get_case()`.

The default configuration points to the public Bradbury deployment. `.env.example` documents the required variables:

```text
NEXT_PUBLIC_GENLAYER_NETWORK=bradbury
NEXT_PUBLIC_AGENT_COURT_ADDRESS=0x77D72Ffd837071da939462aEEc60fc24FCf4a73c
NEXT_PUBLIC_AGENT_COURT_SCHEMA_VERSION=2
NEXT_PUBLIC_AGENT_COURT_NETWORK_ID=4221
NEXT_PUBLIC_AGENT_COURT_ESCROW=1
NEXT_PUBLIC_AGENT_COURT_BUYER=0x33445abc8b75f285cfb83088abada08a288561fd
```

Do not commit `.env.local`; it is ignored by Git.

## Reviewer demo flow

1. Open `/court` and review the live agreement state, obligations, evidence, and ruling.
2. Connect the configured buyer, seller, or designated-opener wallet.
3. Available actions depend on on-chain state:
   - `draft` → buyer can fund escrow
   - `funded` → authorized parties can submit evidence, dispute, or buyer can accept
   - `disputed` → authorized parties can request adjudication
   - `resolved` → authorized parties can settle
4. Every write transaction is disabled unless the contract reports schema version 2 and the network ID matches Bradbury.

The live agreement has already completed the full lifecycle, so reviewers can also verify each transaction using the table above without spending testnet funds.

## Architecture

```text
contracts/agent_court.py        Intelligent Contract: agreement, evidence, adjudication, settlement
deploy/001_deploy_agent_court.ts GenLayer deployment script
lib/genlayer.ts                 Frontend GenLayer adapter and transaction receipt validation
components/AgreementState.tsx   Live agreement UI and wallet actions
tests/test_contract.py          Contract lifecycle and consensus tests
tests/genlayer.test.ts          Frontend adapter and write-guard tests
```

### Security model

- `adjudicate()` takes **no client payload**; it builds the prompt from stored contract state.
- Only buyer, seller, or designated opener may submit evidence, dispute, or adjudicate.
- Public evidence must match its SHA-256 hash; source URIs must use HTTPS.
- Private evidence is hash-only and cannot be cited by the AI ruling.
- Each obligation has a fixed `weight_bps`; payout allocation is deterministic code.
- Settlement is idempotent and guarded against duplicate execution.
- Receipts must be `FINALIZED`, `SUCCESS`, and `FINISHED_WITH_RETURN` before the UI reports success.

Bradbury's current GenVM exposes `run_nondet_unsafe`; the validator therefore checks the leader result without invoking the LLM a second time, avoiding deterministic violations on this network.

## Deploy

Create an encrypted CLI account interactively—never place a private key in source or shell history:

```bash
npx genlayer account create --name agent-court
npx genlayer account use agent-court
```

Configure deployment variables in `.env.local`, then run:

```bash
npm run deploy:bradbury
```

The script deploys `contracts/agent_court.py`, waits for finalization, and writes the contract address and transaction ID to `deployments/testnet-bradbury.json`.

The `genlayer write` CLI always sends `value: 0`; `fund` must therefore be sent through the browser UI or another client that supplies `msg.value`. On Bradbury, `gl.message.value` is denominated in wei.

## Validation

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile contracts/agent_court.py
```

`genvm-lint` is not currently available in this environment; Python tests and the finalized Bradbury deployment provide the available deployment validation.

## Privacy boundary

GenLayer state is public. Raw private evidence and secret URLs are never sent to the contract. Private records are represented by content hash and public provenance only; hash-only evidence cannot establish unseen facts during adjudication.

## Status and limitations

- Single live agreement mode; multi-case indexing is not implemented.
- Settlement ends at `settlement_queued`; final transfer receipt tracking is still needed.
- The frontend is a hackathon MVP and is not yet suitable for unrestricted production use.
