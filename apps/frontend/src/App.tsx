import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type VideoItem = {
  id: string;
  title: string;
  path: string;
  durationSeconds: number | null;
};

type VideoListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: VideoItem[];
};

type VideoDetail = VideoItem;

type ResumeResponse = {
  videoId: string;
  positionSeconds: number;
  updatedAt: string | null;
};

type BrowseRoute = {
  kind: "browse";
  page: number;
  pageSize: number;
  q: string;
};

type WatchRoute = {
  kind: "watch";
  id: string;
};

type AppRoute = BrowseRoute | WatchRoute;

const DEFAULT_PAGE_SIZE = 12;

const readPositiveNumber = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const getRouteFromLocation = (): AppRoute => {
  const path = window.location.pathname;
  if (path.startsWith("/watch/")) {
    const id = decodeURIComponent(path.replace("/watch/", "").trim());
    if (id.length > 0) {
      return { kind: "watch", id };
    }
  }

  const params = new URLSearchParams(window.location.search);
  return {
    kind: "browse",
    page: readPositiveNumber(params.get("page"), 1),
    pageSize: readPositiveNumber(params.get("pageSize"), DEFAULT_PAGE_SIZE),
    q: params.get("q")?.trim() ?? "",
  };
};

const toBrowsePath = (page: number, pageSize: number, q: string): string => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("q", q);
  return `/?${params.toString()}`;
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return "Unknown length";
  }
  const rounded = Math.floor(seconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const PAGINATION_WINDOW = 2;

const getPaginationItems = (
  current: number,
  total: number,
): (number | "…")[] => {
  if (total <= 1) return [1];
  const low = Math.max(2, current - PAGINATION_WINDOW);
  const high = Math.min(total - 1, current + PAGINATION_WINDOW);
  const items: (number | "…")[] = [1];
  if (low > 2) items.push("…");
  for (let p = low; p <= high; p++) items.push(p);
  if (high < total - 1) items.push("…");
  items.push(total);
  return items;
};

const App = () => {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromLocation());
  const [browse, setBrowse] = useState<VideoListResponse | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [previewReadyIds, setPreviewReadyIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [watchVideo, setWatchVideo] = useState<VideoDetail | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [resumePosition, setResumePosition] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRefs = useRef(new Map<string, HTMLVideoElement>());
  const lastSyncedSecondsRef = useRef<number>(0);

  useEffect(() => {
    const onPopstate = () => {
      setRoute(getRouteFromLocation());
    };
    window.addEventListener("popstate", onPopstate);
    return () => {
      window.removeEventListener("popstate", onPopstate);
    };
  }, []);

  useEffect(() => {
    if (route.kind === "browse") {
      setSearchInput(route.q);
      setPreviewVideoId(null);
      setPreviewReadyIds(new Set());
      return;
    }

    setPreviewVideoId(null);
    setPreviewReadyIds(new Set());
  }, [route]);

  useEffect(() => {
    for (const [videoId, element] of previewVideoRefs.current) {
      if (videoId === previewVideoId) {
        element.currentTime = 0;
        const playAttempt = element.play();
        if (playAttempt && typeof playAttempt.catch === "function") {
          void playAttempt.catch(() => {
            // Ignore autoplay failures; the thumbnail stays visible until a preview frame loads.
          });
        }
        continue;
      }

      element.pause();
      element.currentTime = 0;
    }
  }, [previewVideoId]);

  useEffect(() => {
    if (route.kind !== "browse") {
      return;
    }

    setBrowseError(null);
    const controller = new AbortController();
    const url = `/api/videos?page=${route.page}&pageSize=${route.pageSize}&q=${encodeURIComponent(route.q)}`;

    fetch(url, { method: "GET", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load videos");
        }
        const data = (await response.json()) as VideoListResponse;
        setBrowse(data);
      })
      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setBrowseError("Could not load video catalog.");
      });

    return () => {
      controller.abort();
    };
  }, [route]);

  useEffect(() => {
    if (route.kind !== "watch") {
      return;
    }

    const controller = new AbortController();
    setWatchError(null);
    setWatchVideo(null);

    const loadWatchData = async () => {
      const [videoResponse, resumeResponse] = await Promise.all([
        fetch(`/api/videos/${route.id}`, { signal: controller.signal }),
        fetch(`/api/videos/${route.id}/resume`, { signal: controller.signal }),
      ]);

      if (!videoResponse.ok) {
        throw new Error("Unable to load video");
      }
      if (!resumeResponse.ok) {
        throw new Error("Unable to load resume");
      }

      const video = (await videoResponse.json()) as VideoDetail;
      const resume = (await resumeResponse.json()) as ResumeResponse;

      setWatchVideo(video);
      setResumePosition(resume.positionSeconds);
      lastSyncedSecondsRef.current = resume.positionSeconds;
    };

    loadWatchData().catch((error: unknown) => {
      if ((error as Error).name === "AbortError") {
        return;
      }
      setWatchError("Could not load this video.");
    });

    return () => {
      controller.abort();
    };
  }, [route]);

  useEffect(() => {
    if (route.kind !== "watch") {
      return;
    }
    const player = videoRef.current;
    if (!player || resumePosition <= 0) {
      return;
    }
    player.currentTime = resumePosition;
  }, [route, watchVideo, resumePosition]);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setRoute(getRouteFromLocation());
  };

  const totalPages = useMemo(() => {
    if (!browse) {
      return 1;
    }
    return Math.max(1, Math.ceil(browse.total / browse.pageSize));
  }, [browse]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const pageSize =
      route.kind === "browse" ? route.pageSize : DEFAULT_PAGE_SIZE;
    navigate(toBrowsePath(1, pageSize, searchInput.trim()));
  };

  const onTimeUpdate = () => {
    if (route.kind !== "watch" || !videoRef.current) {
      return;
    }

    const seconds = Math.floor(videoRef.current.currentTime);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }

    if (Math.abs(seconds - lastSyncedSecondsRef.current) < 5) {
      return;
    }

    lastSyncedSecondsRef.current = seconds;
    void fetch(`/api/videos/${route.id}/resume`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionSeconds: seconds }),
    });
  };

  const setPreviewVideoRef =
    (videoId: string) => (element: HTMLVideoElement | null) => {
      if (element) {
        previewVideoRefs.current.set(videoId, element);
        return;
      }

      previewVideoRefs.current.delete(videoId);
    };

  const startPreview = (videoId: string) => {
    setPreviewReadyIds((current) => {
      if (!current.has(videoId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(videoId);
      return next;
    });
    setPreviewVideoId(videoId);
  };

  const stopPreview = (videoId: string) => {
    setPreviewVideoId((current) => (current === videoId ? null : current));
  };

  const markPreviewReady = (videoId: string) => {
    setPreviewReadyIds((current) => {
      if (current.has(videoId)) {
        return current;
      }

      const next = new Set(current);
      next.add(videoId);
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button
          className="brand"
          type="button"
          onClick={() => navigate(toBrowsePath(1, DEFAULT_PAGE_SIZE, ""))}
        >
          LocalTube
        </button>
        <form
          role="search"
          aria-label="Video search"
          className="search-form"
          onSubmit={submitSearch}
        >
          <label htmlFor="video-search" className="sr-only">
            Search videos
          </label>
          <input
            id="video-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search local videos"
            aria-label="Search videos"
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <main>
        {route.kind === "browse" ? (
          <section aria-label="Browse videos" className="browse-layout">
            {browseError ? <p role="alert">{browseError}</p> : null}
            {!browse ? (
              <p>Loading videos...</p>
            ) : (
              <>
                <ul className="video-grid">
                  {browse.items.map((video) => (
                    <li key={video.id} className="video-card">
                      <button
                        type="button"
                        className="video-link"
                        onClick={() =>
                          navigate(`/watch/${encodeURIComponent(video.id)}`)
                        }
                      >
                        <div
                          className={
                            previewVideoId === video.id &&
                            previewReadyIds.has(video.id)
                              ? "video-media video-media-active"
                              : "video-media"
                          }
                          onMouseEnter={() => startPreview(video.id)}
                          onMouseLeave={() => stopPreview(video.id)}
                        >
                          <img
                            src={`/api/videos/${video.id}/thumbnail`}
                            alt=""
                            loading="lazy"
                          />
                          <video
                            ref={setPreviewVideoRef(video.id)}
                            className="video-preview"
                            src={
                              previewVideoId === video.id
                                ? `/api/videos/${video.id}/stream`
                                : undefined
                            }
                            muted
                            playsInline
                            loop
                            preload="metadata"
                            onLoadedData={() => markPreviewReady(video.id)}
                            aria-hidden="true"
                            tabIndex={-1}
                          />
                        </div>
                        <div className="video-copy">
                          <h2 className="video-title" title={video.title}>
                            {video.title}
                          </h2>
                          <p>{formatDuration(video.durationSeconds)}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <nav aria-label="Catalog pagination" className="pagination">
                  <button
                    type="button"
                    className="pagination-nav"
                    onClick={() =>
                      navigate(
                        toBrowsePath(
                          Math.max(1, route.page - 1),
                          route.pageSize,
                          route.q,
                        ),
                      )
                    }
                    disabled={route.page <= 1}
                  >
                    Previous
                  </button>
                  {getPaginationItems(route.page, totalPages).map((item, i) =>
                    item === "…" ? (
                      <span
                        key={`…-${i}`}
                        className="pagination-ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={
                          item === route.page
                            ? "pagination-page pagination-current"
                            : "pagination-page"
                        }
                        onClick={() =>
                          navigate(
                            toBrowsePath(item, route.pageSize, route.q),
                          )
                        }
                        disabled={item === route.page}
                        aria-label={`Page ${item}`}
                        aria-current={
                          item === route.page ? "page" : undefined
                        }
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="pagination-nav"
                    onClick={() =>
                      navigate(
                        toBrowsePath(
                          Math.min(totalPages, route.page + 1),
                          route.pageSize,
                          route.q,
                        ),
                      )
                    }
                    disabled={route.page >= totalPages}
                  >
                    Next
                  </button>
                </nav>
              </>
            )}
          </section>
        ) : (
          <section className="watch-layout" aria-label="Watch video">
            <button
              type="button"
              className="back-link"
              onClick={() => navigate(toBrowsePath(1, DEFAULT_PAGE_SIZE, ""))}
            >
              Back to Browse
            </button>
            {watchError ? <p role="alert">{watchError}</p> : null}
            {!watchVideo ? (
              <p>Loading video...</p>
            ) : (
              <>
                <h1>{watchVideo.title}</h1>
                <video
                  ref={videoRef}
                  controls
                  src={`/api/videos/${watchVideo.id}/stream`}
                  aria-label="Video player"
                  onTimeUpdate={onTimeUpdate}
                />
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
