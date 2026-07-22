// Generic CRUD zustand store factory — local-first writes to IndexedDB + sync touch.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { useSync } from "./useSync";

export interface CrudState<T> {
  items: T[];
  setAll: (items: T[]) => void;
  add: (patch: Partial<T>) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

type Base = { id: string; createdAt: string; updatedAt: string };

export function createCrud<T extends Base>(
  collection: db.Collection,
  blank: () => Omit<T, "id" | "createdAt" | "updatedAt">
): UseBoundStore<StoreApi<CrudState<T>>> {
  return create<CrudState<T>>((set, get) => ({
    items: [],
    setAll: (items) => set({ items }),

    add: (patch) => {
      const ts = nowIso();
      const item = { ...blank(), id: newId(), createdAt: ts, updatedAt: ts, ...patch } as T;
      set({ items: [...get().items, item] });
      void db.put(collection, item);
      useSync.getState().touch(collection);
      return item;
    },

    update: (id, patch) => {
      let updated: T | undefined;
      set({
        items: get().items.map((it) => {
          if (it.id !== id) return it;
          updated = { ...it, ...patch, updatedAt: nowIso() };
          return updated;
        }),
      });
      if (updated) void db.put(collection, updated);
      useSync.getState().touch(collection);
    },

    remove: (id) => {
      set({ items: get().items.filter((it) => it.id !== id) });
      void db.remove(collection, id);
      useSync.getState().touch(collection);
    },
  }));
}
