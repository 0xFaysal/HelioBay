import { CreditShell } from "@/components/credit/shell";
export const metadata = { robots: { index: false, follow: false } };
export default function Layout({children}: {children: React.ReactNode}) { return <CreditShell admin>{children}</CreditShell>; }
