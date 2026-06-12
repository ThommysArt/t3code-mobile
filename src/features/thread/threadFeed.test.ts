import {
  EventId,
  MessageId,
  TurnId,
  type OrchestrationMessage,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { buildThreadFeed, formatWorkDuration } from "./threadFeed";

const turnId = TurnId.make("turn-1");

function message(
  id: string,
  role: OrchestrationMessage["role"],
  createdAt: string
): OrchestrationMessage {
  return {
    id: MessageId.make(id),
    role,
    text: role,
    attachments: [],
    turnId,
    streaming: false,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("buildThreadFeed", () => {
  it("places a turn work log between the user message and assistant summary", () => {
    const activities: OrchestrationThreadActivity[] = [
      {
        id: EventId.make("activity-start"),
        tone: "info",
        kind: "task.started",
        summary: "Task started",
        payload: {},
        turnId,
        sequence: 0,
        createdAt: "2026-06-12T09:59:59.000Z",
      },
      {
        id: EventId.make("activity-1"),
        tone: "info",
        kind: "task.progress",
        summary: "Reasoning update",
        payload: { summary: "Inspecting the keyboard layout" },
        turnId,
        sequence: 1,
        createdAt: "2026-06-12T10:00:01.000Z",
      },
      {
        id: EventId.make("activity-2"),
        tone: "tool",
        kind: "tool.completed",
        summary: "Read ThreadScreen.tsx",
        payload: { detail: "Loaded the current composer implementation" },
        turnId,
        sequence: 2,
        createdAt: "2026-06-12T10:00:02.000Z",
      },
      {
        id: EventId.make("activity-complete"),
        tone: "info",
        kind: "task.completed",
        summary: "Task completed",
        payload: {},
        turnId,
        sequence: 3,
        createdAt: "2026-06-12T10:00:04.000Z",
      },
    ];

    const feed = buildThreadFeed(
      [
        message("user-1", "user", "2026-06-12T10:00:00.000Z"),
        message("assistant-1", "assistant", "2026-06-12T10:00:03.000Z"),
      ],
      activities
    );

    expect(feed.map((entry) => entry.type)).toEqual(["message", "work-log", "message"]);
    expect(feed[1]).toMatchObject({
      type: "work-log",
      rows: [
        { summary: "Inspecting the keyboard layout", detail: null },
        {
          summary: "Read ThreadScreen.tsx",
          detail: "Loaded the current composer implementation",
        },
      ],
      startedAt: "2026-06-12T09:59:59.000Z",
      completedAt: "2026-06-12T10:00:04.000Z",
    });
  });
});

describe("formatWorkDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatWorkDuration("2026-06-12T10:00:00.000Z", "2026-06-12T10:10:11.000Z")).toBe(
      "10m 11s"
    );
  });
});
