

export const enum VisualWindowType {
  WINDOW_TYPE_UNKNOWN,
  WINDOW_TYPE_CONSOLE_LOG,
  WINDOWN_TYPE_ROOM_STATUS,
}

interface VisualMemory {
  windows: VisualWindowMemory[];
}

interface VisualWindowMemory {
  type: VisualWindowType;
}

interface ConsoleLogWindowMemory extends VisualWindowMemory {
  consoleLines: string[];
}