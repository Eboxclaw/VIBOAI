import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { NoteEditor } from "./NoteEditor";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, FileText, ArrowLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotebookView() {
  const { notes, selectedNoteId, selectNote, addNote } = useStore();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      const matchSearch =
        !search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase());
      const matchTag = !tagFilter || n.tags.includes(tagFilter);
      return matchSearch && matchTag;
    });
  }, [notes, search, tagFilter]);

  // If a note is selected, show the editor full-screen
  if (selectedNoteId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60 backdrop-blur-xl">
          <button
            onClick={() => selectNote(null)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground truncate">
            {notes.find((n) => n.id === selectedNoteId)?.title || "Note"}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <NoteEditor noteId={selectedNoteId} />
        </div>
      </div>
    );
  }

  // Note list view
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2 bg-card/60 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tagFilter && (
              <Badge
                variant="default"
                className="cursor-pointer"
                onClick={() => setTagFilter(null)}
              >
                #{tagFilter} ✕
              </Badge>
            )}
            {allTags
              .filter((t) => t !== tagFilter)
              .slice(0, 6)
              .map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent text-xs"
                  onClick={() => setTagFilter(tag)}
                >
                  #{tag}
                </Badge>
              ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {filtered.map((note) => (
            <button
              key={note.id}
              onClick={() => selectNote(note.id)}
              className="w-full text-left px-3 py-2.5 rounded-xl card-3d hover:bg-accent transition-colors"
            >
              <div className="font-medium text-sm truncate text-foreground">{note.title}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {note.content.slice(0, 60) || "Empty note"}
              </div>
              {note.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {note.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No notes found</p>
            </div>
          )}
        </div>
      </ScrollArea>

    </div>
  );
}
