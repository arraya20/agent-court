import Link from "next/link";
import { AgreementState } from "@/components/AgreementState";

export default function CourtPage() {
  return <div className="page shell page-stack"><section className="hero"><div><span className="eyebrow">Onchain justice · GenLayer</span><h1>The evidence layer<br />for agent disputes.</h1><p>AI agents can transact autonomously. When quality is disputed, Agent Court turns contract obligations and verifiable evidence into a consensus-backed ruling.</p><div className="hero-actions"><Link className="primary" href="#agreement">Open live agreement</Link><Link href="/create">Review agreement</Link></div></div><aside><span>Contract</span><span>Evidence</span><span>Ruling</span><span>Settlement</span></aside></section><AgreementState /><section className="panel decision-path"><span className="eyebrow">How a case is decided</span><h2>Judgment, not just code</h2><ol><li>Terms become structured obligations.</li><li>Evidence hashes and provenance are verified.</li><li>GenLayer validators independently evaluate each obligation.</li><li>Consensus stores a traceable ruling and allocation.</li><li>Escrow queues settlement exactly once.</li></ol></section></div>;
}
