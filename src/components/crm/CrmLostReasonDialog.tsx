"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCrmLostReasons, type CrmLostReason } from "@/app/actions/crm/automation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
};

export function CrmLostReasonDialog({ open, onOpenChange, onConfirm }: Props) {
  const [reasons, setReasons] = useState<CrmLostReason[]>([]);
  const [selected, setSelected] = useState("");
  const [otherText, setOtherText] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setSelected("");
    setOtherText("");
    startTransition(async () => {
      const res = await getCrmLostReasons();
      if ("reasons" in res && res.reasons) setReasons(res.reasons);
      if ("error" in res && res.error) toast.error(res.error);
    });
  }, [open]);

  function handleConfirm() {
    const reason =
      selected === "Other" || selected.toLowerCase() === "other"
        ? otherText.trim() || "Other"
        : selected.trim();
    if (!reason) {
      toast.error("Please select a lost reason.");
      return;
    }
    onConfirm(reason);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lost Reason</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-secondary-muted">
            Select why this opportunity was lost. This is required and used in CRM Reports.
          </p>
          <div>
            <Label>Reason *</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.name}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected.toLowerCase() === "other" ? (
            <div>
              <Label htmlFor="lost-other">Details</Label>
              <Input
                id="lost-other"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe the reason…"
                className="mt-1"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || !selected}>
            Mark as Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
