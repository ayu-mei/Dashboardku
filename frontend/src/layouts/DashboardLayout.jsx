import { useState } from "react";
import {
  LayoutDashboard,
  Table2,
  ChartNoAxesCombined,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
const links = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["data", "Data Bisnis", Table2],
  ["analysis", "Analisis", ChartNoAxesCombined],
  ["smart", "Smart Dashboard", Sparkles],
];
export default function DashboardLayout({ page, onPage, onLogout, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      {open && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
          aria-label="Tutup navigasi"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-navy px-5 py-7 text-white transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-widest">
              REFRAKSI
              <small className="mt-1 block text-[9px] font-normal tracking-[.2em] text-slate-400">
                SALES & FINANCE
              </small>
            </div>
          </div>
          <button
            className="md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-12 px-3 text-[10px] tracking-widest text-slate-400">
          WORKSPACE
        </p>
        <nav className="mt-4 grid gap-2" aria-label="Navigasi utama">
          {links.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`flex items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm ${id === page ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
              aria-current={id === page ? "page" : undefined}
              onClick={() => {
                onPage(id);
                setOpen(false);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-slate-400">
          <ShieldCheck className="mb-3 text-emerald-400" size={20} />
          <strong className="block text-white">Data tersimpan online</strong>
          Transaksi dilindungi login dan hak akses per akun.
        </div>
      </aside>
      <div className="min-w-0 md:ml-60">
        <header className="sticky top-0 z-20 flex h-17 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="md:hidden"
              onClick={() => setOpen(true)}
              aria-label="Buka menu"
            >
              <Menu size={21} />
            </button>
            <span className="truncate text-xs text-slate-500">
              Workspace /{" "}
              <b className="text-slate-700">
                {links.find((link) => link[0] === page)?.[1]}
              </b>
            </span>
          </div>
          <button className="btn-secondary shrink-0" onClick={onLogout}>
            <LogOut size={15} />
            <span>Keluar</span>
          </button>
        </header>
        <main className="mx-auto max-w-[1700px] p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
