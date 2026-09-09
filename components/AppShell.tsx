"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { connectWallet } from "@/lib/genlayer";

const links = [{ href: "/court", label: "Public court" }, { href: "/create", label: "Live agreement" }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string>();
  const [error, setError] = useState<string>();
  async function handleConnect() {
    setError(undefined);
    try { setWallet(await connectWallet()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet connection failed."); }
  }
  return <><header className="topbar"><div className="shell"><Link href="/court" className="brand">AGENT<span>·</span>COURT</Link><nav aria-label="Primary navigation">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>{link.label}</Link>)}</nav><button className="wallet" type="button" onClick={handleConnect}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button>{error && <small role="alert">{error}</small>}</div></header><main>{children}</main><nav className="mobile-nav" aria-label="Mobile navigation">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>{link.label}</Link>)}</nav></>;
}
