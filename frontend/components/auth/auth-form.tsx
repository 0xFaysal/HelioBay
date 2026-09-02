"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, ShieldCheck, LoaderCircle } from "lucide-react";
import { authService, authError } from "@/lib/services/auth";
import { demoEnabled, firebaseConfigured } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetImage } from "@/components/shared/asset-image";
import { PublicShell } from "@/components/shared/public-shell";

export function AuthForm(
  {
    mode,
    role = "owner",
    next = "/dashboard"
  }: {
    mode: "sign-in" | "sign-up" | "forgot-password";
    role?: "owner" | "admin";
    next?: string;
  }
) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [show, setShow] = useState(false);
  const forgot = mode === "forgot-password";
  const register = mode === "sign-up";

  const schema = z.object({
    name: register ? z.string().trim().min(2, "Enter your full name.") : z.string(),
    email: z.email("Enter a valid email address."),
    password: forgot ? z.string() : z.string().min(8, "Use at least 8 characters.")
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),

    defaultValues: {
      name: "",
      email: "",
      password: ""
    }
  });

  const destination = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/dashboard";

  async function submit(values: z.infer<typeof schema>) {
    setError("");
    setBusy(true);

    try {
      if (forgot) {
        await authService.forgot(values.email);
        setSent(true);
      } else {


        if (register)
          await authService.register(values.name, values.email, values.password);
        else
          await authService.login(values.email, values.password);

        router.push(role === "admin" ? "/admin" : destination);
      }
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");

    try {
      await authService.google();
      router.push(role === "admin" ? "/admin" : destination);
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(false);
    }
  }

  const title = forgot ? "A fresh start." : register ? "Your brighter journey starts here." : role === "admin" ? "Welcome, station partner." : "Good to have you back.";

  return (
    <PublicShell footer={false}><div className="auth-wrap">
        <div className="auth-photo">
          <AssetImage loading="eager" src="/images/hero.webp" alt="Solar-powered charging in a peaceful green setting" fill sizes="50vw" />
          <div className="auth-photo-copy">
            <div className="eyebrow mb-6">A BETTER WAY FORWARD</div>
            <h2>A little sunshine.<br />A world of possibility.</h2>
            <p className="text-sm mt-5 text-white/75">Connect to cleaner energy. Make every journey count.</p>
          </div>
        </div>
        <div className="auth-form">
          <div className="eyebrow mb-5">{forgot ? "ACCOUNT RECOVERY" : register ? "JOIN HELIOBAY" : "YOUR ENERGY, CONNECTED"}</div>
          <h1>{title}</h1>
          <p className="text-sm muted mt-3 mb-7">{forgot ? "Enter your email and we’ll send a password reset link." : register ? "Create your EV Owner account in a few simple steps." : "Sign in to your charging companion."}</p>
          {sent ? <div className="notice" role="status">If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.</div> : <form onSubmit={form.handleSubmit(submit)} noValidate>
            {register && <label className="form-field">Full name<Input autoComplete="name" {...form.register("name")} aria-invalid={!!form.formState.errors.name} /><span className="error-text">{form.formState.errors.name?.message}</span></label>}
            <label className="form-field">Email address<Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register("email")}
                aria-invalid={!!form.formState.errors.email} /><span className="error-text">{form.formState.errors.email?.message}</span></label>
            {!forgot && <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  className="pr-12"
                  {...form.register("password")}
                  aria-invalid={!!form.formState.errors.password} />
                <button
                  className="absolute right-3 top-3"
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <span className="error-text">{form.formState.errors.password?.message}</span>
              {!register && <Link href="/auth/forgot-password" className="text-right text-xs underline">Forgot password?</Link>}
            </div>}
            {error && <p className="error-text mb-4" role="alert">{error}</p>}
            <Button className="w-full !h-12" disabled={busy} type="submit">
              {busy ? <LoaderCircle className="animate-spin" /> : forgot ? "Send reset link" : register ? "Create account" : "Sign in"}
              {!busy && <ArrowRight size={16} />}
            </Button>
          </form>}
          {!forgot && role === "owner" && <>
            <div className="flex items-center gap-4 my-5 text-[10px] muted"><div className="h-px bg-border flex-1" />OR<div className="h-px bg-border flex-1" /></div>
            <Button variant="outline" className="w-full !h-12" onClick={google} disabled={busy}><span className="font-bold text-base">G</span>Continue with Google</Button>
          </>}
          {!firebaseConfigured && <p className="notice notice-warning mt-5">Firebase isn’t configured. Email and Google sign-in need project configuration; demo access below is browser-local only.</p>}
          {demoEnabled && <div className="border rounded-xl p-4 mt-5 bg-muted">
            <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={16} />Explore the prototype</div>
            <p className="text-[11px] muted mt-2 mb-3">No real payments or device connections. Demo accounts are not production authentication.</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                authService.demo(role);
                router.push(role === "admin" ? "/admin" : destination);
              }}>{role === "admin" ? "Continue as Demo Admin" : "Continue in Demo Mode"}</Button>
          </div>}
          <div className="text-xs text-center mt-6">{forgot ? <Link href="/auth/sign-in">← Back to sign in</Link> : register ? <>Already connected? <Link className="underline" href="/auth/sign-in">Sign in</Link></> : <>New to HelioBay? <Link className="underline" href="/auth/sign-up">Create an account</Link></>}</div>
          <Link
            href={`/auth/sign-in?role=${role === "owner" ? "admin" : "owner"}`}
            className="block text-[11px] text-center muted mt-5">{role === "owner" ? "Station Partner / Admin sign in →" : "EV Owner sign in →"}</Link>
        </div>
      </div></PublicShell>
  );
}
