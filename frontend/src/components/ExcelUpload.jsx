import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { api } from "../services/api";
import { ErrorMessage } from "./Feedback";
import ExcelReportReview from "./ExcelReportReview";
import SourceImportReview from "./SourceImportReview";
import ImportAIHelp from "./ImportAIHelp";
import TransactionImportConfirmation from "./TransactionImportConfirmation";
const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const fields = [
  ["date", "Tanggal transaksi", true],
  ["product", "Produk", true],
  ["quantity", "Jumlah unit", true],
  ["price", "Harga jual aktual per unit", true],
  ["unit_cost", "HPP per unit", true],
  ["customer", "Pelanggan", false],
  ["category", "Kategori", false],
  ["location", "Cabang / lokasi", false],
];
export default function ExcelUpload({ onImported, onClose, initialYear }) {
  const dialog = useRef(null),
    fileInput = useRef(null),
    sheetInput = useRef(null),
    mappingPanel = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const modal = dialog.current;
    modal.showModal();
    return () => modal.close();
  }, []);
  const [reviewing, setReviewing] = useState(false),
    [mappingOpen, setMappingOpen] = useState(false);
  const [file, setFile] = useState(null),
    [profile, setProfile] = useState(null),
    [sheet, setSheet] = useState(""),
    [header, setHeader] = useState(null),
    [mapping, setMapping] = useState({}),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const missingFields = fields.filter(
    ([key, , required]) =>
      required && (mapping[key] === undefined || mapping[key] === null),
  );
  const columnUsage = new Map();
  for (const [key, label] of fields) {
    const index = mapping[key];
    if (index !== undefined && index !== null) {
      if (!columnUsage.has(index)) columnUsage.set(index, []);
      columnUsage.get(index).push({ key, label });
    }
  }
  const conflicts = [...columnUsage.values()].filter((uses) => uses.length > 1);
  const completeMapping = missingFields.length === 0 && conflicts.length === 0;
  const hasSalesTotal = profile?.columns?.some((col) =>
    /^(sales[ _]+value|sum of sales[ _]+value|sales value \(|sales value promo$)/i.test(
      col.name.trim(),
    ),
  );
  const sourceMode =
    profile?.source_profile && profile.source_profile.kind !== "transaction";
  const currentStep =
    preview || ((profile?.report || sourceMode) && reviewing)
      ? 3
      : profile?.sheet
        ? 2
        : file
          ? 1
          : 0;

  function adjustMapping() {
    setMappingOpen(true);
    requestAnimationFrame(() => {
      mappingPanel.current?.scrollIntoView({ block: "nearest" });
      mappingPanel.current?.querySelector("summary")?.focus();
    });
  }
  async function importRequest(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      return await api(path, {
        method: "POST",
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          path.endsWith("/commit")
            ? "Server belum memberi jawaban. Muat ulang data penjualan untuk memeriksa hasil penyimpanan sebelum mencoba kembali."
            : "Pemeriksaan terlalu lama. Periksa koneksi lalu coba pilih file atau sheet kembali.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  const form = () => {
    const body = new FormData();
    body.append("file", file);
    body.append("sheet", sheet);
    if (header) body.append("header_row", header);
    return body;
  };
  async function inspect(nextFile = file, nextSheet = "") {
    setBusy(true);
    setError("");
    setPreview(null);
    setReviewing(false);
    setMappingOpen(false);
    setProfile((previous) =>
      previous
        ? {
            ...previous,
            recognized: false,
            columns: [],
            sample: [],
            report: null,
            source_profile: null,
          }
        : null,
    );
    setHeader(null);
    setMapping({});
    setConfirmed(false);
    try {
      if (
        !nextFile ||
        !nextFile.name.toLowerCase().endsWith(".xlsx") ||
        nextFile.size > MAX_UPLOAD_BYTES ||
        nextFile.size === 0
      )
        throw new Error(
          `Pilih file .xlsx tidak kosong, maksimal ${MAX_UPLOAD_MB} MB.`,
        );
      const body = new FormData();
      body.append("file", nextFile);
      if (nextSheet) body.append("sheet", nextSheet);
      let value = await importRequest("/api/import/sources/inspect", body);
      if (["transaction", "unknown"].includes(value.source_profile?.kind)) {
        const transaction = await importRequest("/api/import/inspect", body);
        value = {
          ...value,
          ...transaction,
          source_profile:
            value.source_profile?.kind === "unknown"
              ? null
              : value.source_profile,
        };
      }
      setProfile(value);
      setSheet(value.sheet);
      setHeader(value.header_row ?? null);
      setMapping(value.mapping ?? {});
    } catch (err) {
      setError(err.message);
      setProfile(null);
    } finally {
      setBusy(false);
    }
  }
  function chooseFile(selected) {
    setFile(selected);
    setSheet("");
    inspect(selected);
  }
  function clearSelection() {
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
    setProfile(null);
    setSheet("");
    setHeader(null);
    setMapping({});
    setPreview(null);
    setReviewing(false);
    setConfirmed(false);
  }
  async function process(commit = false) {
    if (busy || !completeMapping || (commit && (!preview || !confirmed)))
      return;
    setBusy(true);
    setError("");
    try {
      const body = form();
      body.append("mapping", JSON.stringify(mapping));
      body.append("confirm", commit ? "true" : "false");
      const value = await importRequest(
        "/api/import/" + (commit ? "commit" : "preview"),
        body,
      );
      if (commit) {
        setPreview(null);
        setConfirmed(false);
        onImported();
        onClose();
      } else {
        setPreview(value);
        setConfirmed(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="import-title"
      className="m-auto max-h-[90dvh] w-[900px] max-w-[94vw] overflow-auto rounded-2xl border-0 p-5 shadow-2xl backdrop:bg-slate-950/60 sm:p-7"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="import-title"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Upload size={18} />
          Import Excel
        </h2>
        <button
          autoFocus
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Tutup import"
          className="icon-btn"
        >
          <X size={18} />
        </button>
      </div>
      <p className="muted mt-2">
        Pilih file dan sheet, periksa data, lalu konfirmasi untuk menyimpan.
        File asli tidak diubah.
      </p>
      <ol
        aria-label="Tahapan import"
        className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {["Pilih file", "Pilih sheet", "Periksa data", "Konfirmasi"].map(
          (label, index) => (
            <li
              key={label}
              aria-current={index === currentStep ? "step" : undefined}
              className={`rounded-lg px-3 py-2 text-xs ${index === currentStep ? "bg-emerald-50 font-semibold text-accent" : "bg-slate-50 text-slate-500"}`}
            >
              {index + 1}. {label}
            </li>
          ),
        )}
      </ol>
      <div className="my-5 grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="excel-file-input"
            className="mb-2 text-xs font-medium text-slate-600"
          >
            Pilih File Excel
          </label>
          <input
            ref={fileInput}
            id="excel-file-input"
            className="excel-file-input"
            aria-describedby="excel-file-help"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(event) => {
              const selected = event.target.files[0];
              if (selected) chooseFile(selected);
            }}
          />
          <div
            className={`mt-3 flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-xs transition-colors ${dragging ? "border-accent bg-emerald-50 text-accent" : "border-slate-300 bg-slate-50 text-slate-500"} ${busy ? "opacity-50" : ""}`}
            data-testid="excel-dropzone"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? "none" : "copy";
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (busy) return;
              if (event.dataTransfer.files.length !== 1) {
                clearSelection();
                setError("Seret satu file Excel .xlsx setiap kali impor.");
                return;
              }
              const selected = event.dataTransfer.files[0];
              fileInput.current.files = event.dataTransfer.files;
              chooseFile(selected);
            }}
          >
            <Upload
              size={20}
              aria-hidden="true"
              className="pointer-events-none"
            />
            <span className="pointer-events-none">
              atau seret file Excel dari folder Anda ke sini
            </span>
          </div>
          <p id="excel-file-help" className="muted mt-2 break-words">
            {file ? `File dipilih: ${file.name}. ` : ""}
            {`Pilih file .xlsx dari folder perangkat Anda. Maksimal ${MAX_UPLOAD_MB} MB.`}
          </p>
          {file && error && (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-accent"
              disabled={busy}
              onClick={() => inspect(file, sheet)}
            >
              Periksa ulang file
            </button>
          )}
        </div>
        {profile?.sheets.length > 1 && (
          <label className="min-w-0">
            Pilih Sheet
            <select
              ref={sheetInput}
              className="overflow-hidden"
              aria-label="Pilih Sheet"
              value={sheet}
              disabled={busy}
              onChange={(e) => {
                setSheet(e.target.value);
                inspect(file, e.target.value);
              }}
            >
              <option value="" disabled>
                Pilih sheet yang akan diimpor
              </option>
              {profile.sheets.map((name) => {
                const info = profile.sheet_profiles?.find(
                  (item) => item.name === name,
                );
                return (
                  <option key={name} value={name}>
                    {name}
                    {info
                      ? ` — ${info.label}${info.hidden ? " (tersembunyi)" : ""}`
                      : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </div>
      {profile?.sheet_profiles?.length > 1 && (
        <section
          className="my-4 rounded-xl border border-slate-200 p-4"
          aria-label="Isi workbook"
        >
          <h3 className="font-semibold">Isi workbook Anda</h3>
          <p className="muted mt-2">
            Pilih satu sumber utama. Sheet tahunan, bulanan, event dan pivot
            bisa memuat penjualan yang sama; aplikasi akan memeriksa irisan
            sebelum menyimpan.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...new Set(profile.sheet_profiles.map((item) => item.label))].map(
              (label) => (
                <span
                  key={label}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs"
                >
                  {label}:{" "}
                  {
                    profile.sheet_profiles.filter(
                      (item) => item.label === label,
                    ).length
                  }
                </span>
              ),
            )}
          </div>
          <div className="mt-3 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
            {profile.sheet_profiles
              .filter((item) => item.recommended)
              .map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={busy}
                  onClick={() => inspect(file, item.name)}
                >
                  {item.name} · {item.label}
                </button>
              ))}
          </div>
        </section>
      )}
      {error && <ErrorMessage message={error} />}{" "}
      {!sourceMode && profile?.sheet && (
        <ImportAIHelp profile={profile} preview={preview} />
      )}
      {busy && (
        <p role="status" className="muted my-4">
          Memproses data…
        </p>
      )}
      {!sourceMode && !busy && profile?.sheet && !profile.recognized && (
        <p role="status" className="my-4 rounded-xl bg-amber-50 p-4 text-sm">
          Struktur data belum dapat dikenali. Pilih sheet lain atau periksa
          format file Excel.
        </p>
      )}
      {sourceMode && (
        <SourceImportReview
          key={file?.name + ":" + profile.sheet}
          file={file}
          profile={profile}
          initialYear={initialYear}
          busy={busy}
          setBusy={setBusy}
          request={importRequest}
          onStage={setReviewing}
          onImported={onImported}
          onClose={onClose}
        />
      )}
      {!sourceMode && profile?.report && (
        <ExcelReportReview
          file={file}
          profile={profile}
          initialYear={initialYear}
          busy={busy}
          setBusy={setBusy}
          request={importRequest}
          onStage={setReviewing}
          onImported={onImported}
          onClose={onClose}
        />
      )}
      {!sourceMode && profile?.recognized && !profile.report && (
        <div className="my-5 space-y-4">
          <div
            role="status"
            className={`rounded-xl border p-4 ${completeMapping ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
          >
            <p
              className={`font-semibold ${completeMapping ? "text-accent" : "text-amber-900"}`}
            >
              {completeMapping
                ? "✓ Struktur Data Dikenali"
                : conflicts.length
                  ? "Pencocokan kolom perlu diperbaiki"
                  : "Sheet berhasil dibaca, tetapi kolom transaksi belum lengkap"}
            </p>
            {completeMapping ? (
              <p className="mt-2 text-sm text-slate-600">
                Kolom wajib sudah dicocokkan. Klik Periksa Data untuk memeriksa
                isi transaksi dan melihat preview. Data belum disimpan.
              </p>
            ) : (
              <>
                {missingFields.length > 0 && (
                  <>
                    <p className="mt-2 text-sm text-amber-900">
                      Kolom berikut belum ditemukan otomatis:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                      {missingFields.map(([key, label]) => (
                        <li key={key}>{label}</li>
                      ))}
                    </ul>
                  </>
                )}
                {conflicts.map((uses) => (
                  <p key={uses[0].key} className="mt-2 text-sm text-amber-900">
                    {uses.map(({ label }) => label).join(" dan ")} memakai kolom
                    Excel yang sama. Pilih kolom yang sesuai untuk masing-masing
                    isian, atau kosongkan isian opsional.
                  </p>
                ))}
                <p className="mt-3 text-sm leading-relaxed text-amber-900">
                  Pilih sheet detail yang memuat informasi tersebut. Sheet
                  ringkasan atau pivot saja belum cukup untuk menghitung
                  penjualan dan profit. Jika kolomnya ada dengan nama berbeda,
                  sesuaikan pencocokan kolom. Jangan memilih kolom pengganti
                  untuk data yang tidak tersedia.
                </p>
                {hasSalesTotal && (
                  <p className="mt-3 text-sm leading-relaxed text-amber-900">
                    SALES_VALUE adalah total penjualan. Kolom ini tidak boleh
                    dipakai sebagai tanggal, harga jual per unit, atau HPP.
                    Laporan dengan total penjualan perlu disiapkan terlebih
                    dahulu untuk impor transaksi.
                  </p>
                )}
                <p className="mt-2 text-sm font-medium text-amber-900">
                  Data belum disimpan. Import baru tersedia setelah pemeriksaan
                  transaksi berhasil.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {profile.sheets.length > 1 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => sheetInput.current?.focus()}
                    >
                      Pilih sheet lain
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={adjustMapping}
                  >
                    Sesuaikan kolom
                  </button>
                </div>
              </>
            )}
          </div>
          <p className="text-xs font-medium text-slate-600">
            Kolom dalam sheet {sheet}
          </p>
          <p className="muted break-words">
            {profile.columns.map((col) => col.name).join(" | ")}
          </p>
          <button
            type="button"
            className={completeMapping ? "btn" : "btn-secondary"}
            disabled={busy}
            onClick={() => {
              setReviewing(true);
              if (completeMapping) process(false);
            }}
          >
            {completeMapping ? "Periksa Data" : "Lihat isi sheet"}
          </button>
        </div>
      )}
      {!sourceMode && profile?.recognized && !profile.report && reviewing && (
        <>
          <h3 className="mb-2 font-semibold">Preview data Excel</h3>
          <p className="muted mb-4">
            Sheet: {sheet} · Menampilkan {profile.sample.length} baris pertama.
            Periksa isi data sebelum mengimpor.
          </p>
          <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead>
                <tr>
                  {profile.columns.map((col) => (
                    <th key={col.index}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.sample.map((row, index) => (
                  <tr key={index}>
                    {profile.columns.map((col) => (
                      <td key={col.index}>{row[col.index] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!sourceMode &&
        profile?.recognized &&
        !profile.report &&
        (reviewing || mappingOpen) && (
          <details
            ref={mappingPanel}
            className="my-5 rounded-xl border border-slate-200 p-4"
            open={mappingOpen}
            onToggle={(event) => setMappingOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-semibold text-navy">
              Pengaturan lanjutan: pencocokan kolom
            </summary>
            <p className="muted mt-3">
              Kolom yang dikenali sudah dipilih otomatis. Sesuaikan jika nama
              kolom berbeda. Kolom bertanda * wajib tersedia. Kolom yang sudah
              dipakai isian lain tidak dapat dipilih lagi. Isian opsional boleh
              tetap Tidak tersedia.
            </p>
            {missingFields.length > 0 && (
              <p role="status" className="mt-3 text-sm text-amber-900">
                Belum cocok:{" "}
                {missingFields.map(([, label]) => label).join(", ")}. Jika
                informasi ini tidak ada di sheet, pilih sheet atau file lain.
              </p>
            )}
            {conflicts.length > 0 && (
              <p role="alert" className="mt-3 text-sm text-amber-900">
                Ada kolom yang dipakai untuk beberapa isian. Perbaiki pilihan
                sebelum memeriksa data.
              </p>
            )}
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              {profile.warning}
            </p>
            <div className="my-5 grid gap-4 sm:grid-cols-2">
              {fields.map(([key, label, required]) => (
                <label key={key} className="min-w-0">
                  {label}
                  {required ? " *" : ""}
                  <select
                    aria-label={label + (required ? " *" : "")}
                    value={mapping[key] ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const nextIndex =
                        e.target.value === "" ? null : Number(e.target.value);
                      if (
                        nextIndex !== null &&
                        columnUsage
                          .get(nextIndex)
                          ?.some((use) => use.key !== key)
                      )
                        return;
                      setMapping((previous) => ({
                        ...previous,
                        [key]: nextIndex,
                      }));
                      setPreview(null);
                      setConfirmed(false);
                      setError("");
                    }}
                  >
                    <option value="">
                      {required ? "Pilih kolom yang sesuai" : "Tidak tersedia"}
                    </option>
                    {profile.columns.map((col) => {
                      const otherUses =
                        columnUsage
                          .get(col.index)
                          ?.filter((use) => use.key !== key) ?? [];
                      return (
                        <option
                          key={col.index}
                          value={col.index}
                          disabled={otherUses.length > 0}
                        >
                          {col.name} (kolom {col.index + 1})
                          {otherUses.length > 0
                            ? ` — sudah dipakai untuk ${otherUses.map(({ label }) => label).join(", ")}`
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ))}
            </div>
            <button
              className="btn-secondary"
              disabled={busy || !completeMapping}
              onClick={() => process(false)}
            >
              Periksa Data Transaksi
            </button>
          </details>
        )}
      {!sourceMode && !preview && !profile?.report && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Batal
          </button>
        </div>
      )}
      {preview && (
        <TransactionImportConfirmation
          preview={preview}
          busy={busy}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          onClose={onClose}
          onConfirm={() => process(true)}
        />
      )}
    </dialog>
  );
}
