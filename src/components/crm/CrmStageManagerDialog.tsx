"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCrmPipelineStage,
  deleteCrmPipelineStage,
  reorderCrmPipelineStages,
  updateCrmPipelineStage,
} from "@/app/actions/crm/stages";
import type { CrmPipelineStage } from "@/app/actions/crm/types";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: CrmPipelineStage[];
  onChanged: () => void;
};

export function CrmStageManagerDialog({ open, onOpenChange, stages, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createCrmPipelineStage({ name });
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Stage created");
        setNewName("");
        onChanged();
      }
    });
  }

  function handleSaveEdit(stageId: string) {
    const name = editName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await updateCrmPipelineStage(stageId, { name });
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Stage updated");
        setEditingId(null);
        onChanged();
      }
    });
  }

  function handleDelete(stageId: string) {
    if (!confirm("Delete this stage?")) return;
    startTransition(async () => {
      const result = await deleteCrmPipelineStage(stageId);
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Stage deleted");
        onChanged();
      }
    });
  }

  function moveStage(index: number, direction: -1 | 1) {
    const next = [...stages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const result = await reorderCrmPipelineStages(next.map((s) => s.id));
      if ("error" in result && result.error) toast.error(result.error);
      else onChanged();
    });
  }

  function toggleFold(stage: CrmPipelineStage) {
    startTransition(async () => {
      const result = await updateCrmPipelineStage(stage.id, { is_folded: !stage.is_folded });
      if ("error" in result && result.error) toast.error(result.error);
      else onChanged();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pipeline Stages</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New stage name"
              disabled={isPending}
            />
            <Button onClick={handleCreate} disabled={isPending || !newName.trim()} className="gap-1">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <ul className="space-y-2">
            {stages.map((stage, index) => (
              <li
                key={stage.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={index === 0 || isPending}
                    onClick={() => moveStage(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={index === stages.length - 1 || isPending}
                    onClick={() => moveStage(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === stage.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    <div>
                      <p className="font-medium text-sm text-primary-dark">{stage.name}</p>
                      <p className="text-xs text-secondary-muted">
                        {stage.is_won ? "Won" : stage.is_lost ? "Lost" : "Open"}
                        {stage.is_folded ? " · Folded" : ""}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={stage.is_folded ? "Unfold" : "Fold"}
                    onClick={() => toggleFold(stage)}
                    disabled={isPending}
                  >
                    {stage.is_folded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                  {editingId === stage.id ? (
                    <Button size="sm" onClick={() => handleSaveEdit(stage.id)} disabled={isPending}>
                      Save
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(stage.id);
                        setEditName(stage.name);
                      }}
                      disabled={isPending}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => handleDelete(stage.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
