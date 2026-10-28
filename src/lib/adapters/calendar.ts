export type CalendarEventInput = {
  calendarEventId?: string | null;
  requestId?: string;
  calendarId?: string | null;
  ownerUserId?: string | null;
  startAt: Date;
  endAt: Date;
  summary: string;
  sessionMode?: string;
};

export type BusyBlock = { startAt: Date; endAt: Date };

export type CalendarPort = {
  ensureMeeting?(input: {
    ownerUserId: string;
    calendarEventId: string;
  }): Promise<string | null>;
  appendNote?(input: {
    ownerUserId: string;
    calendarEventId: string;
    noteId: string;
    text: string;
  }): Promise<void>;
  updateEvent(input: CalendarEventInput): Promise<{ calendarEventId: string }>;
  cancelEvent(input: {
    calendarEventId?: string | null;
    calendarId?: string | null;
    ownerUserId?: string | null;
  }): Promise<void>;
  listBusy(input: {
    ownerUserId?: string | null;
    calendarId?: string | null;
    excludeEventId?: string | null;
    from: Date;
    to: Date;
  }): Promise<BusyBlock[]>;
};

export class MemoryCalendar implements CalendarPort {
  async ensureMeeting(input: { ownerUserId: string; calendarEventId: string }) {
    return `https://meet.google.com/test-${input.calendarEventId}`;
  }
  readonly appendedNotes: Array<{
    ownerUserId: string;
    calendarEventId: string;
    noteId: string;
    text: string;
  }> = [];
  async appendNote(input: {
    ownerUserId: string;
    calendarEventId: string;
    noteId: string;
    text: string;
  }) {
    if (!this.appendedNotes.some((n) => n.noteId === input.noteId))
      this.appendedNotes.push(input);
  }
  readonly updates: CalendarEventInput[] = [];
  readonly cancels: Array<{ calendarEventId?: string | null }> = [];
  readonly busy: BusyBlock[] = [];

  async updateEvent(input: CalendarEventInput) {
    this.updates.push(input);
    this.busy.push({ startAt: input.startAt, endAt: input.endAt });
    return { calendarEventId: input.calendarEventId ?? `cal_${this.updates.length}` };
  }

  async cancelEvent(input: { calendarEventId?: string | null }) {
    this.cancels.push(input);
  }

  async listBusy() {
    return this.busy;
  }
}
