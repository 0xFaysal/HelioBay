"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";
import { useAuth } from "./providers";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const links = [
  ["Find a station", "/stations"],
  ["How it works", "/how-it-works"],
  ["Pricing", "/pricing"],
  ["Our impact", "/sustainability"]
];

export function PublicHeader() {
  const path = usePathname();

  const {
    user
  } = useAuth();

  const [open, setOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="container-wide public-nav">
        <Brand />
        <nav aria-label="Main navigation" className="nav-links">{links.map(
            ([name, href]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{name}</Link>
          )}</nav>
        <div className="nav-actions">
          <Link className="sign-in" href={user ? "/dashboard" : "/auth/sign-in"}>{user ? "My dashboard" : "Sign in"}</Link>
          <Link href="/stations" className="action action-dark">Start charging <ArrowUpRight size={14} /></Link>
          <Button
            className="mobile-menu-button"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}><Menu /></Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}><SheetContent className="p-7">
          <SheetTitle><Brand /></SheetTitle>
          <SheetDescription>Find your next clean charge.</SheetDescription>
          <nav className="flex flex-col gap-5 mt-6">{[...links, [user ? "My dashboard" : "Sign in", user ? "/dashboard" : "/auth/sign-in"]].map(
              ([label, href]) => <Link href={href} key={href} onClick={() => setOpen(false)} className="py-2 border-b">{label}</Link>
            )}</nav>
        </SheetContent></Sheet>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="container-wide">
      <div className="footer-grid">
        <div>
          <Brand />
          <p className="text-xs text-muted-foreground max-w-[250px] mt-4">A little sunshine. A smarter charge.<br />A better way to move forward.</p>
        </div>
        <div>
          <h4>Explore</h4>
          {links.map(([name, href]) => <Link key={href} href={href}>{name}</Link>)}
        </div>
        <div>
          <h4>Your HelioBay</h4>
          <Link href="/dashboard">Owner dashboard</Link>
          <Link href="/wallet">Credit wallet</Link>
          <Link href="/vehicles">My vehicles</Link>
          <Link href="/auth/sign-in?role=admin">Station partner sign in</Link>
        </div>
        <div>
          <h4>Good to know</h4>
          <Link href="/how-it-works#faq">Help & FAQs</Link>
          <Link href="/pricing#policy">Credit policy</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms of use</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 HelioBay. Designed for a brighter tomorrow.</span>
        <span>Interactive prototype · Sample network data · Made for Bangladesh</span>
      </div>
    </footer>
  );
}

export function FinalCTA() {
  return (
    <section className="cta-section">
      <div className="eyebrow justify-center">YOUR NEXT CHAPTER IS ELECTRIC</div>
      <h2 className="mt-5">A better charge. A brighter road.</h2>
      <p>Find your nearest HelioBay and make your next journey a cleaner one.</p>
      <Link href="/stations" className="action action-dark">Find your next charge <ArrowRight size={16} /></Link>
    </section>
  );
}

export function PublicShell(
  {
    children,
    footer = true
  }: {
    children: React.ReactNode;
    footer?: boolean;
  }
) {
  return (
    <>
      <PublicHeader />
      <main id="main-content">{children}</main>
      {footer && <PublicFooter />}
    </>
  );
}
