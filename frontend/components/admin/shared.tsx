"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Download, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function Status({ children, good = false, danger = false }: { children: ReactNode; good?: boolean; danger?: boolean }) {
  return <Badge variant="outline" className={`capitalize ${good ? "bg-green-50 text-green-800" : danger ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground"}`}>{children}</Badge>;
}
export function AdminHeading({ eyebrow = "NETWORK OPERATIONS", title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="owner-heading"><div><p className="eyebrow !mb-3">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const link = (e: MouseEvent) => { if ((e.target as HTMLElement).closest("a[href]") && !window.confirm("Discard your unsaved changes?")) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", link, true); };
  }, [dirty]);
  return () => !dirty || window.confirm("Discard your unsaved changes?");
}
export function ConfirmAction({ label, title, description, action, danger = false, word, disabled = false }: {
  label: string; title: string; description: string; action: () => Promise<unknown>; danger?: boolean; word?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [typed, setTyped] = useState("");
  return <>
    <Button variant={danger ? "destructive" : "outline"} disabled={disabled} onClick={() => { setError(""); setTyped(""); setOpen(true); }}>{label}</Button>
    <AlertDialog.Root open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <AlertDialog.Portal><AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-black/30" />
        <AlertDialog.Popup className="confirm-popup">
          <AlertDialog.Title className="text-xl font-medium">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm muted mt-3">{description}</AlertDialog.Description>
          {word && <label className="block mt-4 text-sm">Type {word} to confirm<Input className="mt-2" value={typed} onChange={e => setTyped(e.target.value)} /></label>}
          {error && <p className="notice notice-warning mt-4" role="alert">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3 mt-6"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep current state</Button><Button variant={danger ? "destructive" : "default"} disabled={busy || Boolean(word && typed !== word)} onClick={async () => {
            setBusy(true); setError("");
            try { await action(); setOpen(false); toast.success("Request applied. Device commands require an acknowledgement."); }
            catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? "Working…" : "Confirm"}</Button></div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </>;
}

export interface DataColumn<T> { label: string; value: (row: T) => string | number; render?: (row: T) => ReactNode }
function csvCell(value: string | number) {
  const text = String(value); const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}
export function DataGrid<T extends { id: string }>({ rows, columns, name, onInspect, filters }: { rows: T[]; columns: DataColumn<T>[]; name: string; onInspect?: (row: T) => void; filters?: ReactNode }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState(0); const [direction, setDirection] = useState(1); const [page, setPage] = useState(0);
  const matching = rows.filter(row => columns.some(c => String(c.value(row)).toLowerCase().includes(query.toLowerCase()))).sort((a, b) => {
    const left = columns[sort].value(a), right = columns[sort].value(b);
    return direction * (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right)));
  });
  const pages = Math.max(1, Math.ceil(matching.length / 6)); const current = Math.min(page, pages - 1); const visible = matching.slice(current * 6, current * 6 + 6);
  return <section className="panel data-grid">
    <div className="admin-toolbar"><label className="relative flex-1 min-w-0"><Search size={16} className="absolute left-3 top-3.5 muted" /><Input className="!pl-10" aria-label={`Search ${name}`} placeholder={`Search ${name}…`} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>{filters}<Button variant="outline" disabled={!visible.length} onClick={() => exportCsv(`heliobay-${name}`, columns.map(c => c.label), visible.map(row => columns.map(c => c.value(row))))}><Download size={15} />Export visible CSV</Button></div>
    {!visible.length ? <div className="empty-state"><h2>No matching {name}.</h2><p>Try another search or change the filters.</p>{query && <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>}</div> : <>
      <div className="admin-desktop-table"><Table><TableHeader><TableRow>{columns.map((c, i) => <TableHead key={c.label} aria-sort={sort === i ? direction > 0 ? "ascending" : "descending" : "none"}><Button variant="ghost" size="sm" onClick={() => { setSort(i); setDirection(sort === i ? -direction : 1); }}>{c.label}{sort === i ? direction > 0 ? " ↑" : " ↓" : ""}</Button></TableHead>)}{onInspect && <TableHead>Details</TableHead>}</TableRow></TableHeader><TableBody>{visible.map(row => <TableRow key={row.id}>{columns.map(c => <TableCell key={c.label}>{c.render ? c.render(row) : c.value(row)}</TableCell>)}{onInspect && <TableCell><Button variant="outline" size="sm" onClick={() => onInspect(row)} aria-label={`Inspect ${row.id}`}>Inspect</Button></TableCell>}</TableRow>)}</TableBody></Table></div>
      <div className="admin-mobile-cards">{visible.map(row => <article key={row.id}>{columns.map(c => <div className="data-row" key={c.label}><span>{c.label}</span><span>{c.render ? c.render(row) : c.value(row)}</span></div>)}{onInspect && <Button className="w-full mt-3" variant="outline" onClick={() => onInspect(row)}>Inspect {row.id}</Button>}</article>)}</div>
    </>}
    <div className="admin-pagination"><span>{matching.length} results · Page {current + 1} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={`Previous ${name} page`} disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label={`Next ${name} page`} disabled={current + 1 === pages} onClick={() => setPage(current + 1)}><ChevronRight /></Button></div></div>
  </section>;
}
