import { useEffect, useState } from "react";
import { Download, Upload, ChevronDown, Target, FileText, Image as ImageIcon } from "lucide-react";
import { StorageIcon, LibraryIcon } from "../lib/icons";

// First-visit onboarding hint pointing at the Library. Persisted so it only
// ever shows once per browser; dismissed as soon as the user hovers it.
const LIBRARY_HINT_KEY = "mc.libraryHint.v1";

export interface StorageOption { id: string; title: string; type: string; }

export interface TopBarProps {
  pendingCount?: number;
  storages?: StorageOption[];
  storageId?: string | null;
  onStorageChange?: (id: string) => void;
  onImport?: () => void;
  onImportFromOwox?: () => void;
  onExport?: () => void;
  onExportSvg?: () => void;
  exportDisabled?: boolean;
  onShare?: () => void;
  shareDisabled?: boolean;
  onPush?: () => void;
  onLibrary?: () => void;
  onOpenGoal?: () => void;
  goalSet?: boolean;
  questionsEnabled?: boolean;
}

export function TopBar({
  pendingCount = 0, storages = [], storageId, onStorageChange,
  onImport, onImportFromOwox, onExport, onExportSvg, exportDisabled = false,
  onPush, onLibrary,
  onOpenGoal, goalSet = false, questionsEnabled = false,
}: TopBarProps) {
  // Push split-button menu (holds the signed-in "Import from OWOX project" action).
  const [menuOpen, setMenuOpen] = useState(false);
  // Export dropdown (OKF markdown / PNG / SVG).
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // Show the Library hint on first ever visit; stays lit until hovered.
  const [showLibraryHint, setShowLibraryHint] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(LIBRARY_HINT_KEY)) setShowLibraryHint(true); } catch { /* private mode */ }
  }, []);
  const dismissLibraryHint = () => {
    setShowLibraryHint(false);
    try { localStorage.setItem(LIBRARY_HINT_KEY, "seen"); } catch { /* private mode */ }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-[9px] bg-white border-b border-[#d8dee8] flex-shrink-0 z-30">
      {/* Business Goal — entry point for Insight Questions. Hidden unless the
          server reports GEMINI_API_KEY is set (questionsEnabled), so it's a pure
          env switch: drop the key and the whole AI feature disappears, no
          redeploy of code needed. */}
      {questionsEnabled && (
        <button
          onClick={onOpenGoal}
          aria-label="Business goal — see the questions your model unlocks"
          title="Set a business goal to see the questions your model unlocks"
          className={`flex items-center gap-[6px] rounded-lg px-[10px] py-[6px] text-[13px] font-[550] cursor-pointer transition-colors ${goalSet ? "text-[#1e88e5] bg-[#e6f1fb]" : "text-slate-500 hover:bg-[#f1f3f7] hover:text-slate-900"}`}
        >
          <Target size={16} /> {goalSet ? "Business goal" : "Set business goal"}
        </button>
      )}

      {/* Storage picker — one storage per model (joinable requires same storage) */}
      <label className="flex items-center gap-[7px] text-[13px] text-slate-500 border border-[#d8dee8] rounded-lg px-[10px] py-[5px] bg-white" title="One storage per model — joinable relationships require all marts on the same storage">
        <StorageIcon size={14} /> Storage:
        <select
          value={storageId ?? ""}
          onChange={e => onStorageChange?.(e.target.value)}
          className="text-slate-900 font-semibold bg-white outline-none cursor-pointer"
        >
          {storages.length === 0 && <option value="">—</option>}
          {storages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>

      <div className="flex-1" />

      {/* Templates */}
      <div className="relative">
        {/* Pulsing ring highlights the Templates control on first visit */}
        {showLibraryHint && (
          <span className="absolute -inset-[3px] rounded-[10px] ring-2 ring-[#1e88e5]/60 animate-pulse pointer-events-none" />
        )}
        <button
          onClick={() => { dismissLibraryHint(); onLibrary?.(); }}
          title="Browse model templates"
          className="text-[13px] font-[550] text-slate-900 border border-[#d8dee8] bg-white rounded-lg px-3 py-[7px] cursor-pointer flex items-center gap-[6px] hover:bg-[#f1f3f7]"
        >
          <LibraryIcon size={15} /> Templates
        </button>
        {showLibraryHint && (
          <div
            role="tooltip"
            onMouseEnter={dismissLibraryHint}
            className="absolute top-[calc(100%+11px)] right-0 z-40 w-[232px] rounded-lg bg-slate-900 text-white text-[12.5px] leading-[1.45] px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.28)] cursor-default"
          >
            <span className="absolute -top-[5px] right-[18px] w-[10px] h-[10px] bg-slate-900 rotate-45" />
            Roll out a ready-made model from the templates — or build your own from scratch.
          </div>
        )}
      </div>

      {/* Import OKF */}
      <button
        onClick={onImport}
        className="text-[13px] font-[550] border border-[#d8dee8] bg-white text-slate-900 rounded-lg px-3 py-[7px] cursor-pointer flex items-center gap-[6px] hover:bg-[#f1f3f7]"
      >
        <Download size={15} /> Import
      </button>

      {/* Export — dropdown: OKF markdown, PNG image, SVG image */}
      <div className="relative">
        <button
          onClick={() => setExportMenuOpen(o => !o)}
          disabled={exportDisabled}
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          title={exportDisabled ? "Add a mart first, then export" : "Export this model"}
          className="text-[13px] font-[550] border border-[#d8dee8] bg-white text-slate-900 rounded-lg px-3 py-[7px] cursor-pointer flex items-center gap-[6px] hover:bg-[#f1f3f7] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload size={15} /> Export <ChevronDown size={14} className="text-slate-400" />
        </button>
        {exportMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
            <div role="menu" className="absolute top-[calc(100%+6px)] right-0 z-50 w-[232px] rounded-lg border border-[#d8dee8] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] py-1">
              <button role="menuitem" onClick={() => { setExportMenuOpen(false); onExport?.(); }} className="w-full text-left text-[13px] text-slate-900 px-3 py-2 cursor-pointer flex items-center gap-[8px] hover:bg-[#f1f3f7]">
                <FileText size={15} className="text-slate-500" /> OKF (Markdown)
              </button>
              <button role="menuitem" onClick={() => { setExportMenuOpen(false); onExportSvg?.(); }} className="w-full text-left text-[13px] text-slate-900 px-3 py-2 cursor-pointer flex items-center gap-[8px] hover:bg-[#f1f3f7]">
                <ImageIcon size={15} className="text-slate-500" /> Image (SVG)
              </button>
            </div>
          </>
        )}
      </div>

      {/* Share and Save both live in the right rail now — no top-bar buttons. */}

      {/* Push to OWOX — split button: primary push + caret menu holding the
          less-common "Import from OWOX project" action. */}
      <div className="relative flex items-center">
        <button
          onClick={onPush}
          className="text-[13px] font-[550] bg-[#1e88e5] text-white border border-[#1e88e5] px-3 py-[7px] cursor-pointer flex items-center gap-[6px] hover:bg-[#1976d2] rounded-l-lg border-r-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} width={15} height={15}>
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
          Push to OWOX{pendingCount > 0 && <span className="opacity-80">({pendingCount})</span>}
        </button>
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-label="More OWOX actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="text-white bg-[#1e88e5] border border-[#1e88e5] border-l border-l-[#4d97e8] rounded-r-lg px-[7px] py-[9px] cursor-pointer hover:bg-[#1976d2] flex items-center"
        >
          <ChevronDown size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="absolute top-[calc(100%+6px)] right-0 z-50 w-[230px] rounded-lg border border-[#d8dee8] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] py-1">
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onImportFromOwox?.(); }}
                className="w-full text-left text-[13px] text-slate-900 px-3 py-2 cursor-pointer flex items-center gap-[8px] hover:bg-[#f1f3f7]"
              >
                <Download size={15} /> Import from OWOX project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
