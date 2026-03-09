import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { FileText } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { notes, selectNote, setActiveView } = useStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (noteId: string) => {
    selectNote(noteId);
    setActiveView("notebook");
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search notes..." />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>
        <CommandGroup heading="Notes">
          {notes.map((note) => (
            <CommandItem
              key={note.id}
              value={note.title + " " + note.content}
              onSelect={() => handleSelect(note.id)}
            >
              <FileText className="mr-2 h-4 w-4" />
              <div>
                <span className="font-medium">{note.title}</span>
                {note.tags.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {note.tags.map((t) => `#${t}`).join(" ")}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
