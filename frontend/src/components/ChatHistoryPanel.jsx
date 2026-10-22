import { useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";

export default function ChatHistoryPanel({ history, busy, onClose, onSelect }) {
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  return (
    <section
      id="yuwi-history"
      className="yuwi-history"
      aria-label="Riwayat percakapan"
    >
      <div className="yuwi-history-heading">
        <strong>Riwayat chat</strong>
        <button
          className="icon-btn"
          aria-label="Tutup riwayat"
          onClick={() => onClose()}
        >
          <X size={16} />
        </button>
      </div>
      <p className="muted text-xs">Tersimpan di browser ini untuk akun Anda.</p>
      {busy && (
        <p className="muted text-xs mt-2">
          Tunggu jawaban atau tekan Hentikan sebelum berganti chat.
        </p>
      )}
      <input
        className="input mt-2 w-full"
        aria-label="Cari riwayat chat"
        placeholder="Cari percakapan…"
        value={historySearch}
        onChange={(event) => setHistorySearch(event.target.value)}
      />
      {!history.conversations.some((item) =>
        item.title
          .toLocaleLowerCase()
          .includes(historySearch.toLocaleLowerCase()),
      ) && <p className="muted mt-3 text-xs">Percakapan tidak ditemukan.</p>}
      <ul className="yuwi-history-list">
        {history.conversations
          .filter((item) =>
            item.title
              .toLocaleLowerCase()
              .includes(historySearch.toLocaleLowerCase()),
          )
          .map((item) => (
            <li
              key={item.id}
              className={item.id === history.activeId ? "is-active" : ""}
            >
              <button
                className="yuwi-history-item"
                disabled={busy}
                aria-current={item.id === history.activeId ? "true" : undefined}
                onClick={() => {
                  history.select(item.id);
                  onClose();
                  setDeleteCandidate(null);
                  onSelect();
                }}
              >
                <span>{item.title}</span>
                <small>
                  {item.id === history.activeId ? "Aktif · " : ""}
                  {new Date(item.updatedAt).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </button>
              <button
                className="icon-btn"
                aria-label={`Ubah nama chat ${item.title}`}
                onClick={() => {
                  setRenaming(item.id);
                  setNewTitle(item.title);
                  setDeleteCandidate(null);
                }}
              >
                <Pencil size={14} />
              </button>
              {renaming === item.id && (
                <form
                  className="yuwi-history-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newTitle.trim()) {
                      history.rename(item.id, newTitle);
                      setRenaming(null);
                      setHistorySearch("");
                    }
                  }}
                >
                  <input
                    autoFocus
                    className="input"
                    aria-label="Nama percakapan"
                    maxLength={80}
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                  />
                  <button type="submit" disabled={!newTitle.trim()}>
                    Simpan
                  </button>
                  <button type="button" onClick={() => setRenaming(null)}>
                    Batal
                  </button>
                </form>
              )}
              {deleteCandidate === item.id ? (
                <div className="yuwi-history-confirm">
                  <span>Hapus chat ini?</span>
                  <button
                    disabled={busy}
                    onClick={() => {
                      history.remove(item.id);
                      setDeleteCandidate(null);
                      onSelect();
                    }}
                  >
                    Hapus
                  </button>
                  <button onClick={() => setDeleteCandidate(null)}>
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  className="icon-btn"
                  disabled={busy}
                  aria-label={`Hapus chat ${item.title}`}
                  onClick={() => setDeleteCandidate(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
