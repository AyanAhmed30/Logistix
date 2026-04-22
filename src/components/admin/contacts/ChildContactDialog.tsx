"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Phone, Briefcase } from "lucide-react";
import {
  createChildContact,
  type Contact,
  type ContactKind,
} from "@/app/actions/contacts";

type Props = {
  open: boolean;
  parentId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (contact: Contact) => void;
};

const KIND_OPTIONS: { value: ContactKind; label: string }[] = [
  { value: "contact", label: "Contact" },
  { value: "invoice", label: "Invoice" },
  { value: "delivery", label: "Delivery" },
  { value: "other", label: "Other" },
];

export function ChildContactDialog({ open, parentId, onOpenChange, onCreated }: Props) {
  const [kind, setKind] = useState<ContactKind>("contact");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobPosition, setJobPosition] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setKind("contact");
      setName("");
      setEmail("");
      setPhone("");
      setJobPosition("");
      setNotes("");
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function submit(mode: "close" | "new") {
    if (!parentId) {
      toast.error("Save the main contact first");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }

    startTransition(async () => {
      const res = await createChildContact({
        parent_id: parentId,
        contact_kind: kind,
        name: trimmed,
        email,
        phone,
        job_position: jobPosition,
        notes,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("contact" in res && res.contact) {
        onCreated(res.contact);
        toast.success("Related contact added");
      }
      if (mode === "close") {
        onOpenChange(false);
      } else {
        setName("");
        setEmail("");
        setPhone("");
        setJobPosition("");
        setNotes("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Related Contacts</DialogTitle>
        </DialogHeader>

        {/* Kind radios */}
        <div className="flex items-center gap-5 pb-2 border-b">
          {KIND_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="child-kind"
                checked={kind === opt.value}
                onChange={() => setKind(opt.value)}
                className="accent-violet-600"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        {/* Top fields - with icons like Odoo */}
        <div className="flex gap-4 pt-1">
          <div className="h-20 w-20 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-secondary-muted shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="h-10 w-10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brandon Freeman"
              className="text-lg font-semibold h-11"
            />
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-secondary-muted" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="border-0 border-b rounded-none px-0 h-7 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-secondary-muted" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="border-0 border-b rounded-none px-0 h-7 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-secondary-muted" />
              <Input
                value={jobPosition}
                onChange={(e) => setJobPosition(e.target.value)}
                placeholder="Job title"
                className="border-0 border-b rounded-none px-0 h-7 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs text-secondary-muted">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes..."
            rows={3}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={() => submit("close")} disabled={isPending}>
            Save &amp; Close
          </Button>
          <Button variant="secondary" onClick={() => submit("new")} disabled={isPending}>
            Save &amp; New
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
