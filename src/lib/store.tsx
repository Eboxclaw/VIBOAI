import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Note, KanbanColumn, DEFAULT_COLUMNS, ViewMode } from "./types";
import { encryptData, saveEncryptedNotes, loadAgentNotes, saveAgentNotes } from "./crypto";
import { tauriClient } from "./tauriClient";

interface StoreContextType {
  notes: Note[];
  agentNotes: Note[];
  columns: KanbanColumn[];
  activeView: ViewMode;
  selectedNoteId: string | null;
  setActiveView: (v: ViewMode) => void;
  selectNote: (id: string | null) => void;
  addNote: (column?: string, isKanban?: boolean) => Note;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  moveNote: (id: string, column: string, position: number) => void;
  addAgentNote: (note: Partial<Note>) => Note;
  getAgentNotes: () => Note[];
}

const StoreContext = createContext<StoreContextType | null>(null);

const COLUMNS_KEY = "zettel-columns";

function loadColumns(): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

interface StoreProviderProps {
  children: React.ReactNode;
  pin: string;
  initialNotes: Note[];
}

export function StoreProvider({ children, pin, initialNotes }: StoreProviderProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [agentNotes, setAgentNotes] = useState<Note[]>(() => {
    try { return JSON.parse(loadAgentNotes()); } catch { return []; }
  });
  const [columns] = useState<KanbanColumn[]>(loadColumns);
  const [activeView, setActiveView] = useState<ViewMode>("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const pinRef = useRef(pin);
  const tauriAvailable = tauriClient.isAvailable();

  useEffect(() => {
    if (!tauriAvailable) return;

    const loadNotesFromTauri = async () => {
      const tauriNotes = await tauriClient.listNotes();
      if (tauriNotes) {
        setNotes(tauriNotes);
      }
    };

    void loadNotesFromTauri();
  }, [tauriAvailable]);

  // Keep browser-local persistence only for non-Tauri runtime.
  useEffect(() => {
    if (tauriAvailable) return;

    const save = async () => {
      try {
        const encrypted = await encryptData(JSON.stringify(notes), pinRef.current);
        saveEncryptedNotes(encrypted);
      } catch (e) {
        console.error("Failed to encrypt notes:", e);
      }
    };
    void save();
  }, [notes, tauriAvailable]);

  // Save agent notes (unencrypted — agents always have access)
  useEffect(() => {
    saveAgentNotes(JSON.stringify(agentNotes));
  }, [agentNotes]);

  const addNote = useCallback((column = "inbox", isKanban = false) => {
    const now = new Date().toISOString();
    const kanbanTemplate = isKanban
      ? "## Task\n\n**Status:** To Do\n**Priority:** Medium\n\n### Description\n\n\n### Acceptance Criteria\n- [ ] \n"
      : "";
    const note: Note = {
      id: crypto.randomUUID(),
      title: "Untitled",
      content: kanbanTemplate,
      tags: [],
      column,
      position: Date.now(),
      isKanban,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((prev) => [note, ...prev]);
    setSelectedNoteId(note.id);
    void tauriClient.createNote(note);
    return note;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes((prev) => {
      const nextNotes = prev.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      );
      const updated = nextNotes.find((n) => n.id === id);
      if (updated) {
        void tauriClient.updateNote(updated);
      }
      return nextNotes;
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNoteId((prev) => (prev === id ? null : prev));
    void tauriClient.deleteNote(id);
  }, []);

  const moveNote = useCallback((id: string, column: string, position: number) => {
    setNotes((prev) => {
      const nextNotes = prev.map((n) =>
        n.id === id ? { ...n, column, position, updatedAt: new Date().toISOString() } : n
      );
      const moved = nextNotes.find((n) => n.id === id);
      if (moved) {
        void tauriClient.updateNote(moved);
      }
      return nextNotes;
    });
  }, []);

  const selectNote = useCallback((id: string | null) => {
    setSelectedNoteId(id);
  }, []);

  const addAgentNote = useCallback((partial: Partial<Note>) => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: partial.title || "Agent Note",
      content: partial.content || "",
      tags: partial.tags || ["agent"],
      column: "agent",
      position: Date.now(),
      isKanban: false,
      createdAt: now,
      updatedAt: now,
    };
    setAgentNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const getAgentNotes = useCallback(() => agentNotes, [agentNotes]);

  return (
    <StoreContext.Provider
      value={{
        notes,
        agentNotes,
        columns,
        activeView,
        selectedNoteId,
        setActiveView,
        selectNote,
        addNote,
        updateNote,
        deleteNote,
        moveNote,
        addAgentNote,
        getAgentNotes,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be inside StoreProvider");
  return ctx;
}
