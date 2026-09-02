"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage(
  {
    reset
  }: {
    reset: () => void;
  }
) {
  return (
    <main id="main-content" className="empty-state">
      <h1 className="text-3xl">Let’s reconnect.</h1>
      <p>This page couldn’t load. Your saved demo data is still on this device.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
