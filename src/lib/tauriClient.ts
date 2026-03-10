import { Note } from "./types";

interface TauriFrontmatter {
  title?: string;
  tags: string[];
  aliases: string[];
  created?: string;
  modified?: string;
  custom: Record<string, unknown>;
}

interface TauriNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter: TauriFrontmatter;
  created_at: string;
  modified_at: string;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const hasTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let invokeFnPromise: Promise<InvokeFn> | null = null;

async function getInvoke(): Promise<InvokeFn> {
  if (!invokeFnPromise) {
    invokeFnPromise = import("@tauri-apps/api/core").then((mod) => mod.invoke as InvokeFn);
  }
  return invokeFnPromise;
}

async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!hasTauriRuntime()) return null;

  try {
    const invoke = await getInvoke();
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.warn(`Tauri command failed (${cmd})`, error);
    return null;
  }
}

function fileNameFromNoteId(noteId: string): string {
  return noteId.endsWith(".md") ? noteId : `${noteId}.md`;
}

function noteToFrontmatter(note: Note): TauriFrontmatter {
  return {
    title: note.title,
    tags: note.tags,
    aliases: [],
    created: note.createdAt,
    modified: note.updatedAt,
    custom: {
      column: note.column,
      position: note.position,
      isKanban: note.isKanban,
      viboNoteId: note.id,
    },
  };
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const markerIndex = content.indexOf("\n---", 3);
  if (markerIndex === -1) return content;
  return content.slice(markerIndex + 4).trimStart();
}

function tauriNoteToUiNote(note: TauriNote): Note {
  const custom = note.frontmatter?.custom ?? {};
  const positionValue = Number(custom.position);
  const hasNumericPosition = Number.isFinite(positionValue);

  return {
    id: typeof custom.viboNoteId === "string" ? custom.viboNoteId : note.id,
    title: note.title || "Untitled",
    content: stripFrontmatter(note.content),
    tags: note.tags ?? [],
    column: typeof custom.column === "string" ? custom.column : "inbox",
    position: hasNumericPosition ? positionValue : Date.now(),
    isKanban: Boolean(custom.isKanban),
    createdAt: note.frontmatter?.created ?? note.created_at,
    updatedAt: note.frontmatter?.modified ?? note.modified_at,
  };
}

export const tauriClient = {
  isAvailable: hasTauriRuntime,
  async listNotes(): Promise<Note[] | null> {
    const result = await invokeCommand<Array<{ id: string }>>("note_list");
    if (!result) return null;

    const notes = await Promise.all(
      result.map(async (stub) => invokeCommand<TauriNote>("note_read", { id: stub.id }))
    );

    return notes.filter((note): note is TauriNote => Boolean(note)).map(tauriNoteToUiNote);
  },
  async createNote(note: Note): Promise<void> {
    const id = fileNameFromNoteId(note.id);
    await invokeCommand("note_create", {
      id,
      content: note.content,
      frontmatter: noteToFrontmatter(note),
    });
  },
  async updateNote(note: Note): Promise<void> {
    const id = fileNameFromNoteId(note.id);
    await invokeCommand("note_patch", { id, body: note.content });
    await invokeCommand("note_set_frontmatter", { id, frontmatter: noteToFrontmatter(note) });
  },
  async deleteNote(noteId: string): Promise<void> {
    await invokeCommand("note_delete", { id: fileNameFromNoteId(noteId) });
  },
};
