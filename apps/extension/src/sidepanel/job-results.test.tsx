// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionMessage, JobRecord } from "@atlas/shared";
import { useJobResults } from "./job-results";

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useJobResults>;
let send: ReturnType<typeof vi.fn>;
const onError = vi.fn();
const job = (id: string) => ({ id, status: "completed", rowCount: 1, error: "保存的任务错误" } as JobRecord);
function Harness() { state = useJobResults(onError); return <span>{state.records[0]?.data.title ?? "暂无"}</span>; }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); onError.mockClear();
  send = vi.fn(async (message: ExtensionMessage) => message.type === "GET_JOB" ? job(message.jobId!) : [{ key: message.type === "GET_ROW_RECORDS" ? message.jobId : "", index: 0, data: { title: "新结果" } }]);
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("historical result loading", () => {
  it("loads a completed task once, including stored error information", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => state.setJob(job("A")));
    expect(container.textContent).toBe("新结果"); expect(state.job?.error).toBe("保存的任务错误");
    expect(send).toHaveBeenCalledTimes(2); expect(onError).not.toHaveBeenCalled();
  });
  it("ignores stale data when switching to another task during a request", async () => {
    let release: (value: unknown) => void = () => undefined;
    send.mockImplementation((message: ExtensionMessage) => {
      if (message.type === "GET_ROW_RECORDS" && message.jobId === "A") return new Promise((resolve) => { release = resolve; });
      return Promise.resolve(message.type === "GET_JOB" ? job(message.jobId!) : [{ key: "B", index: 0, data: { title: "B 的结果" } }]);
    });
    await act(async () => root.render(<Harness />));
    await act(async () => state.setJob(job("A")));
    await act(async () => state.setJob(job("B")));
    await act(async () => release([{ key: "A", index: 0, data: { title: "过期结果" } }]));
    expect(container.textContent).toBe("B 的结果"); expect(state.job?.id).toBe("B");
  });
});
