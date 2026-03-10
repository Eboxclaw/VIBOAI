// src/lib/store.tsx
// Persistence moved to Rust (notes.rs + kanban.rs).
// No localStorage. No frontend encryption.
// State is loaded from Rust on mount, mutations go via invoke().

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note, KanbanColumn, DEFAULT_COLUMNS, ViewMode } from "./types";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface StoreContextType {
  notes: Note[];
  agentNotes: Note[];
  columns: KanbanColumn[];
  activeView: ViewMode;
  selectedNoteId: string | null;
  loading: boolean;
  setActiveView: (v: ViewMode) => void;
  selectNote: (id: string | null) => void;
  addNote: (column?: string, isKanban?: boolean) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNote: (id: string, column: string, position: number) => Promise<void>;
  addAgentNote: (note: Partial<Note>) => Promise<Note>;
  getAgentNotes: () => Note[];
  refreshNotes: () => Promise<void>;
}

// ─────────────────────────────────────────
// RUST NOTE → LOCAL NOTE SHAPE
// ─────────────────────────────────────────

interface RustNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function rustNoteToNote(r: RustNote, column: string, position: number, isKanban: boolean): Note {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags,
    column,
    position,
    isKanban,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────

const StoreContext = createContext<StoreContextType | null>(null);

interface StoreProviderProps {
  children: React.ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [agentNotes, setAgentNotes] = useState<Note[]>([]);
  const [columns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);
  const [activeView, setActiveView] = useState<ViewMode>("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Load notes from Rust on mount ──────────────────────────────────
  const refreshNotes = useCallback(async () => {
    try {
      const rustNotes = await invoke<RustNote[]>("note_list");
      const mapped = rustNotes.map(function(r, i) {
        const isKanban = r.tags.indexOf("kanban") !== -1;
        const col = isKanban ? (r.tags.find(function(t) { return t.startsWith("col:"); }) || "col:inbox").slice(4) : "notes";
        return rustNoteToNote(r, col, i, isKanban);
      });

      const regular = mapped.filter(function(n) { return n.tags.indexOf("agent") === -1; });
      const agent   = mapped.filter(function(n) { return n.tags.indexOf("agent") !== -1; });

      setNotes(regular);
      setAgentNotes(agent);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() {
    refreshNotes();
  }, [refreshNotes]);

  // ── Add note ───────────────────────────────────────────────────────
  const addNote = useCallback(async (column: string = "inbox", isKanban: boolean = false): Promise<Note> => {
    const now = new Date().toISOString();
    const tags: string[] = [];
    if (isKanban) { tags.push("kanban"); tags.push("col:" + column); }

    const content = isKanban
      ? "## Task\n\n**Status:** To Do\n**Priority:** Medium\n\n### Description\n\n\n### Acceptance Criteria\n- [ ] \n"
      : "";

    const result = await invoke<RustNote>("note_create", {
      id: "notes/Untitled-" + Date.now() + ".md",
      content,
      frontmatter: { tags },
    });

    const note = rustNoteToNote(result, column, Date.now(), isKanban);
    setNotes(function(prev) { return [note].concat(prev); });
    setSelectedNoteId(note.id);
    return note;
  }, []);

  // ── Update note ────────────────────────────────────────────────────
  const updateNote = useCallback(async (id: string, updates: Partial<Note>): Promise<void> => {
    if (updates.content !== undefined) {
      await invoke("note_patch", { id, body: updates.content });
    }
    if (updates.tags !== undefined) {
      await invoke("note_set_frontmatter", { id, frontmatter: { tags: updates.tags } });
    }
    setNotes(function(prev) {
      return prev.map(function(n) {
        return n.id === id ? Object.assign({}, n, updates, { updatedAt: new Date().toISOString() }) : n;
      });
    });
  }, []);

  // ── Delete note ────────────────────────────────────────────────────
  const deleteNote = useCallback(async (id: string): Promise<void> => {
    await invoke("note_delete", { id });
    setNotes(function(prev) { return prev.filter(function(n) { return n.id !== id; }); });
    setSelectedNoteId(function(prev) { return prev === id ? null : prev; });
  }, []);

  // ── Move note (kanban column change) ───────────────────────────────
  const moveNote = useCallback(async (id: string, column: string, position: number): Promise<void> => {
    // Update tags to reflect new column
    const note = notes.find(function(n) { return n.id === id; });
    if (!note) { return; }
    const filteredTags = note.tags.filter(function(t) { return !t.startsWith("col:"); });
    const newTags = filteredTags.concat(["col:" + column]);
    await invoke("note_set_frontmatter", { id, frontmatter: { tags: newTags } });

    setNotes(function(prev) {
      return prev.map(function(n) {
        return n.id === id
          ? Object.assign({}, n, { column, position, tags: newTags, updatedAt: new Date().toISOString() })
          : n;
      });
    });
  }, [notes]);

  // ── Agent note ─────────────────────────────────────────────────────
  const addAgentNote = useCallback(async (partial: Partial<Note>): Promise<Note> => {
    const result = await invoke<RustNote>("note_create", {
      id: "notes/agent-" + Date.now() + ".md",
      content: partial.content !== undefined ? partial.content : "",
      frontmatter: { tags: ["agent"].concat(partial.tags !== undefined ? partial.tags : []) },
    });
    const note = rustNoteToNote(result, "agent", Date.now(), false);
    setAgentNotes(function(prev) { return [note].concat(prev); });
    return note;
  }, []);

  const getAgentNotes = useCallback(function() { return agentNotes; }, [agentNotes]);

  const selectNote = useCallback(function(id: string | null) { setSelectedNoteId(id); }, []);

  return (
    <StoreContext.Provider
      value={{
        notes,
        agentNotes,
        columns,
        activeView,
        selectedNoteId,
        loading,
        setActiveView,
        selectNote,
        addNote,
        updateNote,
        deleteNote,
        moveNote,
        addAgentNote,
        getAgentNotes,
        refreshNotes,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) { throw new Error("useStore must be inside StoreProvider"); }
  return ctx;
}
