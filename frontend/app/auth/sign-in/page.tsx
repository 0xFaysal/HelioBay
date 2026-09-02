import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "Sign in"
};

export default async function Page(
  {
    searchParams
  }: {
    searchParams: Promise<{
      role?: string;
      next?: string;
    }>;
  }
) {
  const p = await searchParams;
  return <AuthForm mode="sign-in" role={p.role === "admin" ? "admin" : "owner"} next={p.next} />;
}
