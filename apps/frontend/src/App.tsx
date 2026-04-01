import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const App = () => {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromLocation());
  const [browse, setBrowse] = useState<VideoListResponse | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");

  const [watchVideo, setWatchVideo] = useState<VideoDetail | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [resumePosition, setResumePosition] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
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
    }
  }, [route]);

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
                        <img
                          src={`/api/videos/${video.id}/thumbnail`}
                          alt=""
                          loading="lazy"
                        />
                        <h2>{video.title}</h2>
                        <p>{formatDuration(video.durationSeconds)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
                <nav aria-label="Catalog pagination" className="pagination">
                  <button
                    type="button"
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
                  <span>
                    Page {route.page} of {totalPages}
                  </span>
                  <button
                    type="button"
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
