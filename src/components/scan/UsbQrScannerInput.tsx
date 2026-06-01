"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { parseScanIdentifierFromScannerInput } from "@/lib/parse-scan-identifier";
import { submitCartonScan } from "@/lib/submit-carton-scan";
import { usbScannerLog } from "@/lib/usb-scanner-debug";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  enabled?: boolean;
  showCaptureField?: boolean;
};

const TRAILING_JUNK = /[\r\n\t]+$/;
const IDLE_MS = 350;
const DUPLICATE_MS = 2500;

function isTerminator(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" ||
    event.key === "Tab" ||
    event.key === "NumpadEnter" ||
    event.code === "Enter" ||
    event.code === "NumpadEnter" ||
    event.code === "Tab"
  );
}

function isBlockingFormTarget(target: Element | null): boolean {
  if (!target) return false;
  if (target.closest("[role='dialog']")) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((target as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function charFromKeyEvent(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key.length === 1) return event.key;
  if (event.code.startsWith("Key") && event.code.length === 4) {
    const l = event.code.slice(3);
    return event.shiftKey ? l.toUpperCase() : l.toLowerCase();
  }
  const shift = event.shiftKey;
  const map: Record<string, [string, string]> = {
    Digit0: ["0", ")"],
    Digit1: ["1", "!"],
    Digit2: ["2", "@"],
    Digit3: ["3", "#"],
    Digit4: ["4", "$"],
    Digit5: ["5", "%"],
    Digit6: ["6", "^"],
    Digit7: ["7", "&"],
    Digit8: ["8", "*"],
    Digit9: ["9", "("],
    Minus: ["-", "_"],
    Equal: ["=", "+"],
    Semicolon: [";", ":"],
    Quote: ["'", '"'],
    Comma: [",", "<"],
    Period: [".", ">"],
    Slash: ["/", "?"],
    Space: [" ", " "],
  };
  const pair = map[event.code];
  if (!pair) return null;
  return shift ? pair[1] : pair[0];
}

function publishBuffer(value: string) {
  window.dispatchEvent(new CustomEvent("logistix-usb-buffer", { detail: { buffer: value } }));
}

function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function UsbQrScannerInput({ enabled = true, showCaptureField = false }: Props) {
  const enabledRef = useRef(enabled);
  const scanModeRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScanRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  const [scanModeOpen, setScanModeOpen] = useState(false);
  const mounted = useIsHydrated();
  const showCaptureRef = useRef(showCaptureField);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    scanModeRef.current = scanModeOpen;
  }, [scanModeOpen]);

  useEffect(() => {
    showCaptureRef.current = showCaptureField;
  }, [showCaptureField]);

  const clearIdle = useCallback(() => {
    if (idleRef.current) {
      clearTimeout(idleRef.current);
      idleRef.current = null;
    }
  }, []);

  const setValue = useCallback((value: string) => {
    const el = textareaRef.current;
    if (el) el.value = value;
    publishBuffer(value);
  }, []);

  const submitValue = useCallback(
    async (trigger: string) => {
      clearIdle();
      if (!enabledRef.current || busyRef.current) return;

      const raw = (textareaRef.current?.value ?? "").replace(TRAILING_JUNK, "").trim();
      if (!raw) {
        usbScannerLog("submit skipped — empty", { trigger });
        return;
      }

      const scanIdentifier = parseScanIdentifierFromScannerInput(raw);
      usbScannerLog("FINAL QR VALUE", { trigger, raw, scanIdentifier });

      if (!scanIdentifier) {
        toast.error("Not a valid Logistix scan URL.");
        return;
      }

      const now = Date.now();
      if (lastScanRef.current.id === scanIdentifier && now - lastScanRef.current.at < DUPLICATE_MS) {
        setValue("");
        return;
      }

      busyRef.current = true;
      lastScanRef.current = { id: scanIdentifier, at: now };

      const result = await submitCartonScan(scanIdentifier);
      busyRef.current = false;
      setValue("");
      setScanModeOpen(false);

      if (!result.success) {
        toast.error(result.error, { className: "bg-red-600 text-white border-red-600" });
        return;
      }

      const isReInward = result.scanType === "re_inward" || result.scanType === "return";
      const toastMessage = isReInward
        ? result.duplicate
          ? "Re-inward already recorded"
          : "Re-inward recorded — carton back in warehouse"
        : result.duplicate
          ? "Already scanned"
          : "Scanned — progress updating…";
      toast.success(toastMessage, {
        className: isReInward ? "bg-amber-600 text-white" : "bg-green-500 text-white",
      });
    },
    [clearIdle, setValue]
  );

  const scheduleSubmit = useCallback(
    (trigger: string) => {
      clearIdle();
      idleRef.current = setTimeout(() => void submitValue(trigger), IDLE_MS);
    },
    [clearIdle, submitValue]
  );

  const handleTextareaValue = useCallback(
    (value: string, trigger: string) => {
      publishBuffer(value);
      if (!value) return;
      usbScannerLog("textarea value", { trigger, len: value.length, preview: value.slice(0, 100) });
      if (value.includes("/scan/") || /[\r\n]/.test(value)) {
        scheduleSubmit(trigger);
      } else if (value.length > 12) {
        scheduleSubmit("idle");
      }
    },
    [scheduleSubmit]
  );

  const tryClipboardImport = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text.includes("/scan/")) return false;
      setValue(text);
      usbScannerLog("clipboard import", { preview: text.slice(0, 100) });
      void submitValue("clipboard");
      return true;
    } catch {
      return false;
    }
  }, [setValue, submitValue]);

  const focusTextarea = useCallback(() => {
    window.focus();
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  useEffect(() => {
    if (!showCaptureField || !enabled) return;
    usbScannerLog("Scan Progress tab — click the green box, then scan (close Notepad & DevTools)");
    const t1 = window.setTimeout(focusTextarea, 150);
    const t2 = window.setTimeout(focusTextarea, 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [showCaptureField, enabled, focusTextarea]);

  const openScanMode = useCallback(() => {
    if (!enabledRef.current) {
      toast.error("Close Book Order modal first.");
      return;
    }
    setValue("");
    setScanModeOpen(true);
    usbScannerLog("scan mode opened");
    toast.message("Scan mode — close Notepad, then scan into the white box", { duration: 4000 });
    window.setTimeout(focusTextarea, 50);
    window.setTimeout(focusTextarea, 200);
  }, [focusTextarea, setValue]);

  const appendToCapture = useCallback(
    (char: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const next = el.value + char;
      setValue(next);
      handleTextareaValue(next, "wedge-char");
    },
    [handleTextareaValue, setValue]
  );

  useEffect(() => {
    if (!enabled) return;
    usbScannerLog("global wedge listener active");

    const onKeyDown = (e: KeyboardEvent) => {
      if (isBlockingFormTarget(e.target as Element)) return;

      const ta = textareaRef.current;
      const target = e.target as Element | null;
      const onTextarea = target === ta;

      if (
        (scanModeRef.current || showCaptureRef.current) &&
        (e.key.length === 1 || isTerminator(e))
      ) {
        usbScannerLog("raw key", { key: e.key, code: e.code, tag: target?.tagName ?? "?" });
      }

      if (!enabledRef.current) return;

      if (isTerminator(e)) {
        if (scanModeRef.current || onTextarea || (ta?.value ?? "").length > 0) {
          e.preventDefault();
          void submitValue("enter");
        }
        return;
      }

      if (onTextarea) return;

      const char = charFromKeyEvent(e);
      if (!char) return;

      e.preventDefault();
      focusTextarea();
      appendToCapture(char);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isBlockingFormTarget(e.target as Element)) return;
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (!text.includes("/scan/")) return;
      e.preventDefault();
      setValue(text);
      void submitValue("paste");
    };

    const onWindowFocus = () => {
      if (!scanModeRef.current) return;
      void tryClipboardImport();
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("paste", onPaste, true);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("focus", onWindowFocus);
      clearIdle();
    };
  }, [
    enabled,
    appendToCapture,
    clearIdle,
    submitValue,
    setValue,
    handleTextareaValue,
    focusTextarea,
    tryClipboardImport,
  ]);

  const textareaProps = {
    ref: textareaRef,
    name: "usb-qr-scanner-capture",
    autoComplete: "off" as const,
    spellCheck: false,
    "aria-label": "USB QR scanner capture",
    placeholder: "Full localhost /scan/ URL appears here when you scan…",
    onInput: (e: React.FormEvent<HTMLTextAreaElement>) =>
      handleTextareaValue(e.currentTarget.value, "native-input"),
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      handleTextareaValue(e.target.value, "change"),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isTerminator(e.nativeEvent)) {
        e.preventDefault();
        void submitValue("enter");
      }
    },
    onBeforeInput: (e: React.FormEvent<HTMLTextAreaElement>) => {
      const data = (e.nativeEvent as InputEvent).data;
      if (data && data.length > 1) {
        e.preventDefault();
        setValue(data);
        handleTextareaValue(data, "bulk-beforeinput");
      }
    },
  };

  const hiddenField = (
    <textarea
      {...textareaProps}
      rows={1}
      tabIndex={-1}
      aria-hidden
      className="sr-only"
    />
  );

  const scanModeOverlay =
    mounted && scanModeOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col bg-white p-4 sm:p-8"
            role="presentation"
            onClick={focusTextarea}
          >
            <div className="max-w-3xl mx-auto w-full flex flex-col flex-1 gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Scan sticker now</h2>
                <p className="text-sm text-slate-600 mt-2">
                  Close <strong>Notepad</strong> and <strong>DevTools (F12)</strong>. The scanner beep
                  only means it read the QR — the URL must appear in this box (same as Notepad).
                </p>
              </div>

              <textarea
                {...textareaProps}
                rows={6}
                tabIndex={0}
                autoFocus
                className="w-full flex-1 min-h-[8rem] rounded-xl border-4 border-emerald-500 bg-white px-4 py-3 font-mono text-base shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-300"
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void submitValue("manual")}>
                  Save scan
                </Button>
                <Button type="button" variant="outline" onClick={() => void tryClipboardImport()}>
                  Import from clipboard
                </Button>
                <Button type="button" variant="ghost" onClick={() => setScanModeOpen(false)}>
                  Cancel
                </Button>
              </div>

              <p className="text-xs text-slate-500 border-t pt-3">
                If the box stays empty: scan in Notepad → Ctrl+C → click Import from clipboard, or
                switch back to Chrome and we try clipboard automatically.
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  if (!showCaptureField) {
    return (
      <>
        {hiddenField}
        {scanModeOverlay}
      </>
    );
  }

  return (
    <>
      {hiddenField}
      {scanModeOverlay}
      <div className="mb-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-emerald-950">USB scanner</p>
          <p className="text-xs text-emerald-900 mt-1">
            Your console only shows &quot;waiting for keys&quot; because the URL is going to another app
            (usually Notepad). Use fullscreen scan mode.
          </p>
        </div>

        <Button type="button" className="w-full h-12 text-base font-semibold" onClick={openScanMode}>
          Open fullscreen scan mode
        </Button>

        <p className="text-xs text-emerald-800">
          Or: scan in Notepad → copy URL → paste below → Save scan
        </p>
        <textarea
          {...textareaProps}
          rows={2}
          tabIndex={0}
          className="w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 font-mono text-xs min-h-[3rem]"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void submitValue("manual")}>
            Save scan
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void tryClipboardImport()}>
            Paste from clipboard
          </Button>
        </div>
      </div>
    </>
  );
}
