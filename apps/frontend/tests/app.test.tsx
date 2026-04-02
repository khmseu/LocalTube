import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import App from "../src/App.js";

type MockResponseInit = {
  status?: number;
};

const jsonResponse = (value: unknown, init: MockResponseInit = {}) => {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
    },
  });
};

describe("phase 4 frontend integration", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("browse thumbnail hover starts and stops a silent preview", async () => {
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pauseMock = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?")) {
        return jsonResponse({
          page: 1,
          pageSize: 12,
          total: 1,
          items: [
            {
              id: "video-preview",
              title: "Preview Video",
              path: "preview.mp4",
              sizeBytes: 100,
              mtimeMs: 1,
              durationSeconds: 75,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: "Preview Video" });

    const media = document.querySelector(".video-media");
    const preview = document.querySelector(".video-preview") as HTMLVideoElement | null;

    expect(media).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview).not.toHaveAttribute("src");
    expect(preview?.muted).toBe(true);
    expect(preview?.playsInline).toBe(true);

    Object.defineProperty(preview as HTMLVideoElement, "currentTime", {
      configurable: true,
      writable: true,
      value: 9,
    });

    fireEvent.mouseEnter(media as Element);

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
      expect(media).not.toHaveClass("video-media-active");
      expect(preview?.currentTime).toBe(0);
      expect(preview).toHaveAttribute("src", "/api/videos/video-preview/stream");
    });

    fireEvent.loadedData(preview as HTMLVideoElement);

    await waitFor(() => {
      expect(media).toHaveClass("video-media-active");
    });

    (preview as HTMLVideoElement).currentTime = 12;
    fireEvent.mouseLeave(media as Element);

    await waitFor(() => {
      expect(media).not.toHaveClass("video-media-active");
      expect(pauseMock).toHaveBeenCalled();
      expect(preview?.currentTime).toBe(0);
    });
  });

  it("hovered thumbnail click still navigates to watch view", async () => {
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?") && !url.includes("/resume")) {
        return jsonResponse({
          page: 1,
          pageSize: 12,
          total: 1,
          items: [
            {
              id: "video-click",
              title: "Hover Click",
              path: "hover-click.mp4",
              sizeBytes: 100,
              mtimeMs: 1,
              durationSeconds: 75,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }
      if (url.endsWith("/api/videos/video-click")) {
        return jsonResponse({
          id: "video-click",
          title: "Hover Click",
          path: "hover-click.mp4",
          sizeBytes: 100,
          mtimeMs: 1,
          durationSeconds: 75,
          width: 1920,
          height: 1080,
          codecName: "h264",
          formatName: "mp4",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.endsWith("/api/videos/video-click/resume")) {
        return jsonResponse({
          videoId: "video-click",
          positionSeconds: 0,
          updatedAt: null,
        });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const media = (await screen.findByText("Hover Click")).closest(".video-card")?.querySelector(
      ".video-media",
    );
    const preview = document.querySelector(".video-preview") as HTMLVideoElement | null;

    expect(media).not.toBeNull();
    expect(preview).not.toBeNull();

    fireEvent.mouseEnter(media as Element);
    expect(playMock).toHaveBeenCalled();
    fireEvent.loadedData(preview as HTMLVideoElement);

    fireEvent.click(media as Element);

    expect(await screen.findByRole("heading", { name: "Hover Click" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Video player")).toHaveAttribute(
      "src",
      "/api/videos/video-click/stream",
    );
    expect(window.location.pathname).toBe("/watch/video-click");
  });

  it("browse cards use a fixed title block for consistent heights", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?")) {
        return jsonResponse({
          page: 1,
          pageSize: 12,
          total: 2,
          items: [
            {
              id: "video-short",
              title: "Short title",
              path: "short.mp4",
              sizeBytes: 100,
              mtimeMs: 1,
              durationSeconds: 75,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "video-long",
              title:
                "A much longer title that would otherwise stretch this card and make the grid jump between pages",
              path: "long.mp4",
              sizeBytes: 200,
              mtimeMs: 2,
              durationSeconds: 130,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const shortTitle = await screen.findByRole("heading", {
      name: "Short title",
    });
    const longTitle = screen.getByRole("heading", {
      name:
        "A much longer title that would otherwise stretch this card and make the grid jump between pages",
    });

    expect(shortTitle).toHaveClass("video-title");
    expect(longTitle).toHaveClass("video-title");
    expect(shortTitle).toHaveAttribute("title", "Short title");
    expect(longTitle).toHaveAttribute(
      "title",
      "A much longer title that would otherwise stretch this card and make the grid jump between pages",
    );
    expect(shortTitle.closest(".video-copy")).not.toBeNull();
    expect(longTitle.closest(".video-copy")).not.toBeNull();
    expect(document.querySelectorAll(".video-media")).toHaveLength(2);
    expect(document.querySelectorAll(".video-preview")).toHaveLength(2);
    expect(document.querySelectorAll('.video-preview[src]')).toHaveLength(0);

    const appCss = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    expect(appCss).toContain(".video-title {");
    expect(appCss).toContain("min-height: calc(1em * 1.3 * 3);");
    expect(appCss).toContain("-webkit-line-clamp: 3;");
    expect(appCss).toContain(".video-media-active .video-preview {");
  });

  it("pagination shows window around current page with first and last", async () => {
    window.history.pushState({}, "", "/?page=5&pageSize=5");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?")) {
        return jsonResponse({
          page: 5,
          pageSize: 5,
          total: 50,
          items: Array.from({ length: 5 }, (_, i) => ({
            id: `video-${i}`,
            title: `Video ${i + 1}`,
            path: `v${i}.mp4`,
            sizeBytes: 100,
            mtimeMs: 1,
            durationSeconds: null,
            width: null,
            height: null,
            codecName: null,
            formatName: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          })),
        });
      }
      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByRole("heading", { name: "Video 1" });

    const nav = screen.getByRole("navigation", { name: "Catalog pagination" });

    // First and last pages always visible (totalPages = 10)
    expect(within(nav).getByRole("button", { name: "Page 1" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Page 10" })).toBeInTheDocument();

    // Window ±2 around page 5: pages 3, 4, 5, 6, 7
    expect(within(nav).getByRole("button", { name: "Page 3" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Page 7" })).toBeInTheDocument();

    // Pages outside the window are not shown
    expect(within(nav).queryByRole("button", { name: "Page 2" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Page 8" })).toBeNull();

    // Current page is marked
    expect(
      within(nav).getByRole("button", { name: "Page 5" }),
    ).toHaveAttribute("aria-current", "page");

    // Previous / Next present
    expect(within(nav).getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("browse grid renders paged videos", async () => {
    window.history.pushState({}, "", "/?page=2&pageSize=2");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?")) {
        return jsonResponse({
          page: 2,
          pageSize: 2,
          total: 4,
          items: [
            {
              id: "video-3",
              title: "Third Video",
              path: "third.mp4",
              sizeBytes: 300,
              mtimeMs: 3,
              durationSeconds: null,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "video-4",
              title: "Fourth Video",
              path: "fourth.mp4",
              sizeBytes: 400,
              mtimeMs: 4,
              durationSeconds: null,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Third Video" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Fourth Video" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/videos?page=2&pageSize=2&q=",
      expect.anything(),
    );
  });

  it("search param reflected in URL and query call", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/videos?")) {
        return jsonResponse({ page: 1, pageSize: 12, total: 0, items: [] });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search videos",
    });
    fireEvent.change(searchInput, { target: { value: "cats" } });
    fireEvent.submit(screen.getByRole("search", { name: "Video search" }));

    await waitFor(() => {
      expect(window.location.search).toContain("q=cats");
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/videos?page=1&pageSize=12&q=cats",
      expect.anything(),
    );
  });

  it("watch page loads stream URL", async () => {
    window.history.pushState({}, "", "/watch/video-1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/videos/video-1")) {
        return jsonResponse({
          id: "video-1",
          title: "Watch Me",
          path: "watch-me.mp4",
          sizeBytes: 123,
          mtimeMs: 100,
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          codecName: "h264",
          formatName: "mp4",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.endsWith("/api/videos/video-1/resume")) {
        return jsonResponse({
          videoId: "video-1",
          positionSeconds: 12,
          updatedAt: null,
        });
      }

      return jsonResponse({ error: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const video = await screen.findByLabelText("Video player");
    expect(video).toHaveAttribute("src", "/api/videos/video-1/stream");
  });

  it("resume posted on playback updates", async () => {
    window.history.pushState({}, "", "/watch/video-7");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.endsWith("/api/videos/video-7") &&
          (!init || init.method === undefined)
        ) {
          return jsonResponse({
            id: "video-7",
            title: "Resume Me",
            path: "resume.mp4",
            sizeBytes: 777,
            mtimeMs: 100,
            durationSeconds: 120,
            width: 1920,
            height: 1080,
            codecName: "h264",
            formatName: "mp4",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          });
        }
        if (
          url.endsWith("/api/videos/video-7/resume") &&
          (!init || init.method === undefined)
        ) {
          return jsonResponse({
            videoId: "video-7",
            positionSeconds: 0,
            updatedAt: null,
          });
        }
        if (
          url.endsWith("/api/videos/video-7/resume") &&
          init?.method === "PUT"
        ) {
          return jsonResponse({
            videoId: "video-7",
            positionSeconds: 33,
            updatedAt: null,
          });
        }

        return jsonResponse({ error: "Unexpected request" }, { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const video = (await screen.findByLabelText(
      "Video player",
    )) as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      value: 33,
      configurable: true,
    });

    fireEvent.timeUpdate(video);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/videos/video-7/resume",
        expect.objectContaining({
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ positionSeconds: 33 }),
        }),
      );
    });
  });
});
