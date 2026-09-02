"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRound, Bell, ShieldCheck, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useOwnerData } from "@/store/demo-store";
import { useAuth } from "@/components/shared/providers";
import { accountService } from "@/lib/services/account";
import { authService, authError } from "@/lib/services/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function Profile() {
  const d = useOwnerData();

  const {
    user
  } = useAuth();

  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!d || !user)
    return null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    const phone = String(form.get("phone")).trim();
    const city = String(form.get("city")).trim();

    if (name.length < 2 || city.length < 2 || !/^[+\d\s()-]{7,22}$/.test(phone)) {
      toast.error("Enter your name, city, and a valid phone number.");
      return;
    }

    accountService.saveProfile({
      name,
      phone,
      city
    });

    toast.success("Profile saved on this device.");
  }

  async function reset() {
    setBusy(true);

    try {
      if (user!.demo) {
        toast.info("Demo accounts have no password. Use Firebase sign-in to manage real account security.");
        return;
      }

      await authService.forgot(user!.email);
      toast.success("Password reset email requested.");
    } catch (e) {
      toast.error(authError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="owner-heading"><div>
          <h1>Make yourself at home.</h1>
          <p>Your profile, preferences, and account security.</p>
        </div></div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-top">
            <h2 className="panel-title">Personal details</h2>
            <UserRound size={18} />
          </div>
          <form onSubmit={save}>
            <label className="form-field">Full name<Input name="name" defaultValue={d.profile.name} required minLength={2} /></label>
            <label className="form-field">Email address<Input value={user.email} disabled /><span className="text-[10px] muted">Managed by your authentication provider.</span></label>
            <label className="form-field">Phone number<Input name="phone" type="tel" defaultValue={d.profile.phone} required /></label>
            <label className="form-field">City<Input name="city" defaultValue={d.profile.city} required minLength={2} /></label>
            <Button type="submit">Save changes</Button>
          </form>
        </section>
        <div className="space-y-6">
          <section className="panel">
            <div className="panel-top">
              <h2 className="panel-title">Your notifications</h2>
              <Bell size={18} />
            </div>
            {[{
              key: "booking" as const,
              label: "Booking reminders",
              text: "Reservation confirmations and schedule updates."
            }, {
              key: "charging" as const,
              label: "Charging updates",
              text: "Session progress, completion, and safety alerts."
            }, {
              key: "offers" as const,
              label: "News & offers",
              text: "Occasional updates from the HelioBay network."
            }].map(
              p => <div className="flex justify-between items-center py-4 border-b last:border-0 gap-4" key={p.key}>
                <label htmlFor={p.key}>
                  <span className="text-xs font-medium">{p.label}</span>
                  <p className="text-[10px] muted mt-1">{p.text}</p>
                </label>
                <Switch
                  id={p.key}
                  checked={d.preferences[p.key]}
                  onCheckedChange={v => {
                    accountService.preference(p.key, v);
                    toast.success("Preference updated.");
                  }} />
              </div>
            )}
            <p className="text-[10px] muted mt-3">Preferences are saved locally. Real email and push delivery require backend integration.</p>
          </section>
          <section className="panel">
            <div className="panel-top">
              <h2 className="panel-title">Account security</h2>
              <ShieldCheck size={18} />
            </div>
            <p className="text-xs muted mb-4">{user.demo ? "You’re exploring a demo account, not a production session." : "Your sign-in is managed securely by Firebase Authentication."}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={reset} disabled={busy}>Reset password</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await authService.logout();
                    router.push("/");
                  } catch (e) {
                    toast.error(authError(e));
                  }
                }}><LogOut size={14} />Sign out</Button>
            </div>
          </section>
        </div>
      </div>
      <div className="flex gap-5 text-xs muted mt-7">
        <Link href="/privacy" className="underline">Privacy notice</Link>
        <Link href="/terms" className="underline">Prototype terms</Link>
        <Link href="/vehicles" className="underline">Manage vehicles</Link>
      </div>
    </>
  );
}
