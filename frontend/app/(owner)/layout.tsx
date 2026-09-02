import { OwnerShell } from "@/components/owner/owner-shell";
export const metadata = { robots: { index: false, follow: false } };

export default function Layout(
  {
    children
  }: {
    children: React.ReactNode;
  }
) {
  return <OwnerShell>{children}</OwnerShell>;
}
