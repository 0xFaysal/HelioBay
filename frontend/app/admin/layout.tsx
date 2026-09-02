import { AdminShell } from '@/components/admin/admin-shell';
export const metadata = { title: 'Network operations | HelioBay', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
