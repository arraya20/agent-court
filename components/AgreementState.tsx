"use client";

import { useCallback, useEffect, useState } from "react";
import { acceptCourt, addEvidence, configuredContractAddress, connectWallet, openDispute, readCourtState, requestAdjudication, settleCourt, sha256Hex, type ContractState } from "@/lib/genlayer";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const httpsPattern = /^https:\/\/.+/;

type Address = `0x${string}`;

export function AgreementState() {
  const [state, setState] = useState<ContractState>();
  const [wallet, setWallet] = useState<Address>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState({ type: "", hash: "", source: "", visibility: "public", text: "" });

  const load = useCallback(async () => {
    try {
      const result = await readCourtState(configuredContractAddress());
      if (result.schema_version !== 2) throw new Error(`Contract schema ${result.schema_version} is unsupported; deploy the v2 contract.`);
      setState(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read the agreement from GenLayer.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect() {
    setError(undefined);
    try { setWallet(await connectWallet()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet connection failed."); }
  }

  const authorized = Boolean(wallet && state && [state.buyer, state.seller, state.designated_opener].some(address => address.toLowerCase() === wallet.toLowerCase()));
  const buyer = Boolean(wallet && state && wallet.toLowerCase() === state.buyer.toLowerCase());
  const evidenceValid = evidence.type.trim().length > 0 && HASH_PATTERN.test(evidence.hash) && (evidence.visibility === "private" || (evidence.text.trim().length > 0 && (evidence.source === "" || httpsPattern.test(evidence.source))));

  async function run(name: string, action: () => Promise<unknown>, success: string) {
    setPending(name); setError(undefined); setMessage(undefined);
    try { await action(); setMessage(success); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Transaction failed."); }
    finally { setPending(undefined); }
  }

  return <section className="panel live-agreement">
    <div className="section-heading"><div><span className="eyebrow">Live GenLayer agreement</span><h2>Onchain state</h2></div><button type="button" onClick={() => void load()}>Refresh</button></div>
    {!state && <p className="muted">Loading the configured agreement…</p>}
    {state && <dl className="state-grid">
      <div><dt>Contract</dt><dd><code>{configuredContractAddress()}</code></dd></div>
      <div><dt>State</dt><dd>{state.state.replaceAll("_", " ")}</dd></div>
      <div><dt>Escrow</dt><dd>{state.escrow_amount} GEN</dd></div>
      <div><dt>Payout</dt><dd>{state.buyer_bps / 100}% buyer · {state.seller_bps / 100}% seller</dd></div>
    </dl>}
    {state && <section className="panel nested"><h3>Obligations</h3>{state.obligations.map(item => <article key={item.id}><strong>{item.id} · {item.weight_bps / 100}%</strong><p>{item.clause}</p><small>Acceptance: {item.acceptance_criteria}</small><small>Status: {item.status}{item.reasoning ? ` — ${item.reasoning}` : ""}</small></article>)}</section>}
    {state?.ruling_summary && <section className="panel nested"><h3>AI ruling summary</h3><p>{state.ruling_summary}</p></section>}
    {state && <section className="panel nested"><h3>Evidence index</h3>{state.evidence.map(item => <article key={item.id}><strong>{item.id} · {item.type} · {item.visibility}</strong><code>{item.hash}</code><small>{item.visibility === "private" ? "Hash-only: raw content was never sent onchain." : item.text}</small></article>)}</section>}
    <div className="wallet-actions">
      <button type="button" onClick={() => void connect()}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button>
      {state && buyer && state.state === "draft" && <button type="button" className="primary" onClick={() => void run("fund", () => import("@/lib/genlayer").then(module => module.fundCourt()), "Funding finalized.")} disabled={pending !== undefined}>Fund escrow</button>}
      {state && buyer && state.state === "funded" && <button type="button" className="primary" onClick={() => void run("accept", () => acceptCourt(), "Acceptance finalized.")} disabled={pending !== undefined}>Accept delivery</button>}
      {state && authorized && state.state === "funded" && <form onSubmit={(event) => { event.preventDefault(); void run("dispute", () => openDispute(reason.trim()), "Dispute finalized."); }}><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this agreement in dispute?" required /><button className="primary" disabled={pending !== undefined || reason.trim().length === 0}>Open dispute</button></form>}
      {state && authorized && ["funded", "disputed"].includes(state.state) && <form onSubmit={(event) => {
        event.preventDefault();
        const source = evidence.visibility === "private" ? "" : evidence.source.trim();
        const text = evidence.visibility === "private" ? "" : evidence.text.trim();
        void run("evidence", () => addEvidence({ type: evidence.type.trim(), hash: evidence.hash.trim(), source, visibility: evidence.visibility, text }), "Evidence finalized.");
      }}>
        <h3>Submit evidence</h3>
        <label>Evidence type<input value={evidence.type} onChange={(event) => setEvidence({ ...evidence, type: event.target.value })} required /></label>
        <label>Visibility<select value={evidence.visibility} onChange={(event) => setEvidence({ ...evidence, visibility: event.target.value })}><option value="public">Public</option><option value="redacted">Redacted</option><option value="private">Private hash-only</option></select></label>
        <label>Content<textarea rows={3} value={evidence.text} onChange={(event) => setEvidence({ ...evidence, text: event.target.value })} readOnly={evidence.visibility === "private"} placeholder={evidence.visibility === "private" ? "Raw private content is never sent onchain" : "Facts the adjudicator may read"} required={evidence.visibility !== "private"} /></label>
        <button type="button" onClick={async () => setEvidence({ ...evidence, hash: evidence.visibility === "private" ? evidence.hash : await sha256Hex(evidence.text.trim()) })} disabled={pending !== undefined || (evidence.visibility !== "private" && evidence.text.trim().length === 0)}>Hash content locally</button>
        <label>SHA-256 hash<input value={evidence.hash} onChange={(event) => setEvidence({ ...evidence, hash: event.target.value })} required /></label>
        {evidence.visibility !== "private" && <label>Source URI<input value={evidence.source} onChange={(event) => setEvidence({ ...evidence, source: event.target.value })} placeholder="https://…" /></label>}
        <button className="primary" disabled={pending !== undefined || !evidenceValid}>Submit evidence</button>
      </form>}
      {state && authorized && state.state === "disputed" && <button type="button" className="primary" onClick={() => void run("adjudicate", () => requestAdjudication(), "Adjudication finalized.")} disabled={pending !== undefined}>Request adjudication</button>}
      {state && authorized && state.state === "resolved" && !state.settlement_started && <button type="button" className="primary" onClick={() => void run("settle", () => settleCourt(), "Settlement finalized.")} disabled={pending !== undefined}>Settle escrow</button>}
      {state?.settlement_started && <p className="muted">Settlement has been queued. Track the transfer receipts before treating payment as complete.</p>}
      {message && <p className="success">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    </div>
  </section>;
}
