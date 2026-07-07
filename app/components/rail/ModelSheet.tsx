import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { RightPanelId } from "./useRightPanel";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 380;

export function ModelSheet({ active, modal = true, title, onClose, children }: {
  active: RightPanelId | null; modal?: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  // Width is user-resizable via the left-edge drag handle (restores the old
  // Inspector behaviour). Hooks run unconditionally — before the early return.
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      // Sheet is anchored to the right, so dragging its left edge leftwards widens it.
      const delta = startXRef.current - e.clientX;
      setWidth(Math.min(window.innerWidth * 0.6, Math.max(MIN_WIDTH, startWidthRef.current + delta)));
    }
    function onMouseUp() {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (!active) return null;
  return (
    <>
      {/* overlay covers the canvas only for modal panels — inspect keeps canvas interactive */}
      {modal && <div className="absolute inset-0 bg-black/50 z-[15]" onClick={onClose} />}
      <aside
        role="dialog" aria-label={title}
        style={{ width }}
        className="absolute top-0 bottom-0 right-[60px] max-w-[calc(100%-60px)] bg-white border-l border-[#d8dee8]
                   shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)] z-[16] flex flex-col"
      >
        {/* Left-edge drag handle to resize the sheet */}
        <div
          onMouseDown={onResizeMouseDown}
          title="Drag to resize"
          className="absolute left-0 top-0 bottom-0 w-[6px] -ml-[3px] cursor-col-resize z-[17] hover:bg-[#1e88e5]/20"
        />
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[#d8dee8]">
          <h2 className="m-0 text-[17px] font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-[30px] h-[30px] flex items-center justify-center rounded-md text-slate-500 hover:bg-[#f1f3f7]">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
