import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Columns3 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewNoteDialog({ open, onOpenChange }: Props) {
  const { addNote, setActiveView } = useStore();

  const create = (isKanban: boolean) => {
    addNote("inbox", isKanban);
    setActiveView(isKanban ? "kanban" : "notebook");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create New Note</DialogTitle>
          <DialogDescription>What kind of note do you want to create?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => create(false)}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-card p-5 hover:border-primary hover:bg-accent transition-all"
          >
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Note</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Markdown file for ideas & knowledge
              </div>
            </div>
          </button>
          <button
            onClick={() => create(true)}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-card p-5 hover:border-primary hover:bg-accent transition-all"
          >
            <Columns3 className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Task</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Kanban card with task template
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
