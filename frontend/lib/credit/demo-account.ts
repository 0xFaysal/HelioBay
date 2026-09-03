import type { Account } from "../../types/index.ts";
import type { Snapshot } from "./model.ts";

const welcomeCreditsMinor = 50_000;

/**
 * Gives an authenticated Firebase user an isolated actor and wallet when the
 * explicitly selected runtime is the browser-only demo. Without this bridge,
 * the auth shell can be signed in while the demo transaction engine still has
 * no matching user to authorize mutations.
 */
export function withDemoAccount(data: Snapshot, account: Account): Snapshot {
  const existingUser = data.users.find(user => user.id === account.id);
  const existingWallet = data.wallets.find(wallet => wallet.userId === account.id);

  if (existingUser && existingWallet) return data;

  const next = structuredClone(data);

  if (!existingUser) {
    next.users.push({
      id: account.id,
      name: account.name.trim().length >= 2 ? account.name.trim() : "EV Owner",
      email: account.email,
      role: account.role,
      status: "active",
      phone: "",
      city: "Dhaka",
      savedStations: [],
      preferences: { charging: true, wallet: true, offers: false },
    });
  }

  if (!existingWallet) {
    const balanceMinor = account.role === "owner" ? welcomeCreditsMinor : 0;
    next.wallets.push({ userId: account.id, balanceMinor });

    if (balanceMinor > 0) {
      next.ledger.unshift({
        id: `WELCOME-${account.id}`,
        userId: account.id,
        kind: "adjustment",
        amountMinor: balanceMinor,
        balanceAfterMinor: balanceMinor,
        reference: `WELCOME-${account.id}`,
        reason: "Explicit demo starting credit — no real payment",
        status: "posted",
        sandbox: false,
        at: new Date().toISOString(),
      });
    }
  }

  next.revision += 1;
  return next;
}
