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
  // Each block remembers whose calendar it belongs to, because the real adapter
  // reads one owner's calendar. A fake that returned every therapist's busy
  // time would hide exactly the per-therapist scoping tests need to prove.
  readonly busy: Array<BusyBlock & { ownerUserId?: string | null; eventId?: string }> =
    [];

  /** Marks a therapist's calendar busy without going through an appointment. */
  addBusy(input: {
    ownerUserId?: string | null;
    startAt: Date;
    endAt: Date;
    eventId?: string;
  }) {
    this.busy.push(input);
  }

  async updateEvent(input: CalendarEventInput) {
    this.updates.push(input);
    const calendarEventId = input.calendarEventId ?? `cal_${this.updates.length}`;
    this.busy.push({
      ownerUserId: input.ownerUserId,
      startAt: input.startAt,
      endAt: input.endAt,
      eventId: calendarEventId,
    });
    return { calendarEventId };
  }

  async cancelEvent(input: { calendarEventId?: string | null }) {
    this.cancels.push(input);
    const index = this.busy.findIndex((block) => block.eventId === input.calendarEventId);
    if (index >= 0) this.busy.splice(index, 1);
  }

  async listBusy(input: {
    ownerUserId?: string | null;
    calendarId?: string | null;
    excludeEventId?: string | null;
    from: Date;
    to: Date;
  }) {
    return this.busy.filter(
      (block) =>
        // A block with no owner belongs to whoever asks, so existing fixtures
        // that never named an owner keep working.
        (!block.ownerUserId ||
          !input.ownerUserId ||
          block.ownerUserId === input.ownerUserId) &&
        (!input.excludeEventId || block.eventId !== input.excludeEventId) &&
        block.startAt < input.to &&
        block.endAt > input.from,
    );
  }
}
