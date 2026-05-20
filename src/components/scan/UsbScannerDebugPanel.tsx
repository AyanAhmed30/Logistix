"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isUsbScannerDebugEnabled, USB_DEBUG_EVENT } from "@/lib/usb-scanner-debug";
import { ChevronDown, ChevronUp } from "lucide-react";

type LogEntry = {
  timestamp: string;
  step: string;
  detail?: Record<string, unknown>;
};

const MAX_LOGS = 50;

export function UsbScannerDebugPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [windowActive, setWindowActive] = useState(true);
  const [bufferContent, setBufferContent] = useState("");
  const [lastScan, setLastScan] = useState<{ id: string; time: string } | null>(null);
  const logsRef = useRef<LogEntry[]>([]);

  const debugEnabled = useMemo(() => isUsbScannerDebugEnabled(), []);

  useEffect(() => {
    if (!debugEnabled) return;

    const pushLog = (step: string, detail?: Record<string, unknown>) => {
      const entry: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        step,
        detail,
      };
      logsRef.current.unshift(entry);
      if (logsRef.current.length > MAX_LOGS) logsRef.current.pop();
      setLogs([...logsRef.current]);
    };

    const onDebug = (event: Event) => {
      const d = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!d?.step) return;
      const { step, ...rest } = d;
      queueMicrotask(() => {
        pushLog(String(step), Object.keys(rest).length ? rest : undefined);

        if ((step === "char" || step === "textarea value") && typeof rest.preview === "string") {
          setBufferContent(rest.preview.slice(0, 100));
        }
        if (step === "raw key") {
          setBufferContent(`key: ${String(rest.key ?? "")}`);
        }
        if (step === "FINAL QR VALUE" && typeof rest.raw === "string") {
          setBufferContent(rest.raw.slice(0, 100));
        }
        if (step === "processed QR value" && typeof rest.scanIdentifier === "string") {
          setLastScan({ id: rest.scanIdentifier, time: new Date().toLocaleTimeString() });
        }
      });
    };

    const onBuffer = (event: Event) => {
      const buf = (event as CustomEvent<{ buffer?: string }>).detail?.buffer ?? "";
      queueMicrotask(() => setBufferContent(buf.slice(0, 100)));
    };

    const trackFocus = () => {
      const capture = document.querySelector(
        'textarea[name="usb-qr-scanner-capture"]'
      ) as HTMLTextAreaElement | null;
      setWindowActive(document.hasFocus());
      setInputFocused(Boolean(capture && document.activeElement === capture));
    };

    window.addEventListener(USB_DEBUG_EVENT, onDebug);
    window.addEventListener("logistix-usb-buffer", onBuffer);
    document.addEventListener("focusin", trackFocus);
    window.addEventListener("focus", trackFocus);
    window.addEventListener("blur", () => setWindowActive(false));
    const id = window.setInterval(trackFocus, 500);

    return () => {
      window.removeEventListener(USB_DEBUG_EVENT, onDebug);
      window.removeEventListener("logistix-usb-buffer", onBuffer);
      document.removeEventListener("focusin", trackFocus);
      window.removeEventListener("focus", trackFocus);
      window.clearInterval(id);
    };
  }, [debugEnabled]);

  if (!debugEnabled) return null;

  const ready = windowActive && (inputFocused || bufferContent.length > 0);

  return (
    <Card
      data-usb-scan-ignore
      className={`fixed bottom-4 right-4 w-96 shadow-xl border-2 z-40 ${
        ready ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"
      }`}
    >
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{ready ? "🎯" : "⚠"}</span>
            <CardTitle className="text-sm">USB Scanner Debug</CardTitle>
            <Badge variant={ready ? "default" : "secondary"} className="text-xs">
              {bufferContent ? "RECEIVING" : windowActive ? "READY" : "CLICK BROWSER"}
            </Badge>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900 text-slate-100 rounded font-mono">
            <div>
              <div className="text-slate-400">Input Focus</div>
              <div className={inputFocused || bufferContent ? "text-emerald-400" : "text-amber-400"}>
                {bufferContent ? "✓ KEYS OK" : inputFocused ? "✓ FOCUSED" : "— scan now"}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Buffer</div>
              <div className="text-blue-400 truncate">{bufferContent || "—"}</div>
            </div>
            <div>
              <div className="text-slate-400">App Active</div>
              <div className={windowActive ? "text-emerald-400" : "text-red-400"}>
                {windowActive ? "✓ ACTIVE" : "✗ INACTIVE"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-slate-400">Last Scan ID</div>
              <div className="text-cyan-400 truncate">
                {lastScan ? `${lastScan.id} @ ${lastScan.time}` : "—"}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border rounded p-2 max-h-40 overflow-y-auto space-y-1">
            <div className="font-semibold text-slate-600 sticky top-0 bg-slate-50">Recent Events</div>
            {logs.length === 0 ? (
              <div className="text-slate-400 italic">Scan a QR — events appear here</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-slate-700 border-b pb-1 last:border-b-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-slate-500 shrink-0">{log.timestamp}</span>
                    <span className="font-semibold text-right">{log.step}</span>
                  </div>
                  {log.detail && (
                    <div className="text-slate-500 mt-1 pl-2 border-l-2 border-slate-300 break-all">
                      {JSON.stringify(log.detail).slice(0, 140)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <p className="text-slate-500 border-t pt-2">
            Close Notepad, click the Chrome window, open Scan Progress, then scan. Buffer should fill with the URL.
            If Buffer stays empty, keys are going to another app — not Logistix.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
