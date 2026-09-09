import { AgreementState } from "@/components/AgreementState";

export default function CreatePage() {
  return <div className="page shell page-stack"><header className="page-header"><span className="eyebrow">Live agreement</span><h1>Review terms. Fund. Adjudicate.</h1><p>This MVP operates one deployed GenLayer agreement. Every action below reads from and writes to that contract.</p></header><AgreementState /></div>;
}
