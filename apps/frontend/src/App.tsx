import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  RootVideoCount,
  RootVideoCountResponse,
} from "../../shared/src/api-types.js";
import "./App.css";

type VideoItem = {
  id: string;
  title: string;
  path: string;
  durationSeconds: number | null;
  tags: string[];
};

type VideoListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: VideoItem[];
};

type ResumeResponse = {
  videoId: string;
  positionSeconds: number;
  updatedAt: string | null;
};

type TagCount = {
  tag: string;
  videoCount: number;
};

type TagCountResponse = {
  items: TagCount[];
};

type BrowseRoute = {
  kind: "browse";
  page: number;
  pageSize: number;
  q: string;
  tagFilters: string[];
  sort: CatalogSortMode;
};

type WatchRoute = {
  kind: "watch";
  id: string;
};

type AdminRoute = {
  kind: "admin";
};

type AppRoute = BrowseRoute | WatchRoute | AdminRoute;

type CatalogSortMode = "alphabetical" | "runtime";

const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_SORT_MODE: CatalogSortMode = "alphabetical";
const PAGE_SIZE_STORAGE_KEY = "localtube:browse-page-size";

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

const readStoredPageSize = () => {
  try {
    return readPositiveNumber(
      window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY),
      DEFAULT_PAGE_SIZE,
    );
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
};

const writeStoredPageSize = (value: number) => {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures and keep the current browse state working.
  }
};

const getRouteFromLocation = (): AppRoute => {
  const path = window.location.pathname;
  if (path === "/admin") {
    return { kind: "admin" };
  }

  if (path.startsWith("/watch/")) {
    const id = decodeURIComponent(path.replace("/watch/", "").trim());
    if (id.length > 0) {
      return { kind: "watch", id };
    }
  }

  const params = new URLSearchParams(window.location.search);
  const sortParam = params.get("sort");
  const tagsParam = params.get("tags") ?? "";
  const sort: CatalogSortMode =
    sortParam === "runtime" ? "runtime" : DEFAULT_SORT_MODE;
  return {
    kind: "browse",
    page: readPositiveNumber(params.get("page"), 1),
    pageSize: readPositiveNumber(params.get("pageSize"), readStoredPageSize()),
    q: params.get("q")?.trim() ?? "",
    tagFilters: Array.from(
      new Set(
        tagsParam
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right)),
    sort,
  };
};

const toBrowsePath = (
  page: number,
  pageSize: number,
  q: string,
  tagFilters: string[],
  sort: CatalogSortMode,
): string => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("q", q);
  if (tagFilters.length > 0) {
    params.set("tags", tagFilters.join(","));
  }
  params.set("sort", sort);
  return `/?${params.toString()}`;
};

const sortStringsAlphabetically = (values: string[]) => {
  return [...values].sort((left, right) => left.localeCompare(right));
};

const normalizeVideoTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return sortStringsAlphabetically(
    Array.from(
      new Set(
        tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ),
  );
};

const withNormalizedVideoTags = <T extends { tags?: unknown }>(
  video: T,
): T & { tags: string[] } => {
  return {
    ...video,
    tags: normalizeVideoTags(video.tags),
  };
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

const hasErrorName = (value: unknown): value is { name: string } => {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
};

const isAbortError = (error: unknown) => {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return hasErrorName(error) && error.name === "AbortError";
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

  const [watchVideo, setWatchVideo] = useState<VideoItem | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [resumePosition, setResumePosition] = useState<number>(0);
  const [rescanStatus, setRescanStatus] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [rootCounts, setRootCounts] = useState<RootVideoCount[]>([]);
  const [isLoadingRootCounts, setIsLoadingRootCounts] = useState(false);
  const [rootCountsError, setRootCountsError] = useState<string | null>(null);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [isLoadingTagCounts, setIsLoadingTagCounts] = useState(false);
  const [tagCountsError, setTagCountsError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [selectedKnownTag, setSelectedKnownTag] = useState("");
  const [tagEditorStatus, setTagEditorStatus] = useState<string | null>(null);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);

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
      writeStoredPageSize(route.pageSize);
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
        void playAttempt.catch(() => {
          // Ignore autoplay failures; the thumbnail stays visible until a preview frame loads.
        });
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
    const tagFilterQuery =
      route.tagFilters.length > 0
        ? `&tags=${encodeURIComponent(route.tagFilters.join(","))}`
        : "";
    const url = `/api/videos?page=${route.page}&pageSize=${route.pageSize}&q=${encodeURIComponent(route.q)}${tagFilterQuery}&sort=${route.sort}`;

    fetch(url, { method: "GET", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load videos");
        }
        const data = (await response.json()) as VideoListResponse;
        setBrowse({
          ...data,
          items: data.items.map((item) => withNormalizedVideoTags(item)),
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
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

      const video = withNormalizedVideoTags(
        (await videoResponse.json()) as VideoItem,
      );
      const resume = (await resumeResponse.json()) as ResumeResponse;

      setWatchVideo(video);
      setTagDraft("");
      setSelectedKnownTag("");
      setResumePosition(resume.positionSeconds);
      lastSyncedSecondsRef.current = resume.positionSeconds;
    };

    loadWatchData().catch((error: unknown) => {
      if (isAbortError(error)) {
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

  const submitSearch = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const pageSize =
      route.kind === "browse" ? route.pageSize : readStoredPageSize();
    const sort = route.kind === "browse" ? route.sort : DEFAULT_SORT_MODE;
    const tagFilters = route.kind === "browse" ? route.tagFilters : [];
    navigate(toBrowsePath(1, pageSize, searchInput.trim(), tagFilters, sort));
  };

  const getRootSummaryContent = (): ReactNode => {
    if (rootCountsError) {
      return <p role="alert">{rootCountsError}</p>;
    }

    if (isLoadingRootCounts) {
      return <p>Loading root summary...</p>;
    }

    if (rootCounts.length === 0) {
      return <p>No configured roots found.</p>;
    }

    return (
      <table>
        <caption className="sr-only">Roots and videos per root</caption>
        <thead>
          <tr>
            <th scope="col">Root</th>
            <th scope="col">Videos</th>
          </tr>
        </thead>
        <tbody>
          {rootCounts.map((item) => (
            <tr key={item.root}>
              <td>{item.root}</td>
              <td>{item.videoCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const getTagSummaryContent = (): ReactNode => {
    if (tagCountsError) {
      return <p role="alert">{tagCountsError}</p>;
    }

    if (isLoadingTagCounts) {
      return <p>Loading tag summary...</p>;
    }

    if (tagCounts.length === 0) {
      return <p>No tags found.</p>;
    }

    return (
      <table>
        <caption className="sr-only">Tags and videos per tag</caption>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Videos</th>
          </tr>
        </thead>
        <tbody>
          {tagCounts.map((item) => (
            <tr key={item.tag}>
              <td>{item.tag}</td>
              <td>{item.videoCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderBrowseControls = (browseRoute: BrowseRoute) => {
    return (
      <div className="browse-controls">
        <label htmlFor="catalog-sort">Sort by</label>
        <select
          id="catalog-sort"
          value={browseRoute.sort}
          onChange={(event) =>
            changeSortMode(event.target.value as CatalogSortMode)
          }
        >
          <option value="alphabetical">Alphabetical</option>
          <option value="runtime">Runtime (longest first)</option>
        </select>
        <label htmlFor="catalog-page-size">Show</label>
        <input
          id="catalog-page-size"
          className="catalog-page-size"
          type="number"
          min={1}
          step={1}
          value={browseRoute.pageSize}
          onChange={(event) => changePageSize(event.currentTarget.valueAsNumber)}
        />
        <span>videos</span>
      </div>
    );
  };

  const renderTagFilters = (browseRoute: BrowseRoute) => {
    return (
      <details className="tag-filter-panel">
        <summary>
          Tags
          {browseRoute.tagFilters.length > 0
            ? ` (${browseRoute.tagFilters.length} selected)`
            : ""}
        </summary>
        {tagCounts.length === 0 ? (
          <p className="tag-filter-empty">No tags available</p>
        ) : (
          <div className="tag-filter-list">
            {tagCounts.map((item) => {
              const selected = browseRoute.tagFilters.includes(item.tag);
              return (
                <label key={item.tag} className="tag-filter-option">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTagFilter(item.tag)}
                  />
                  <span>{item.tag}</span>
                </label>
              );
            })}
          </div>
        )}
      </details>
    );
  };

  const renderBrowseCards = (browseResponse: VideoListResponse) => {
    return (
      <ul className="video-grid">
        {browseResponse.items.map((video) => (
          <li key={video.id} className="video-card">
            <button
              type="button"
              className="video-link"
              onClick={() => navigate(`/watch/${encodeURIComponent(video.id)}`)}
            >
              <div
                className={
                  previewVideoId === video.id && previewReadyIds.has(video.id)
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
                >
                  <track kind="captions" srcLang="en" label="English" />
                </video>
              </div>
              <div className="video-copy">
                <h2 className="video-title" title={video.title}>
                  {video.title}
                </h2>
                <p className="video-description">
                  {formatDuration(video.durationSeconds)}
                </p>
                <p className="video-description">
                  Tags: {video.tags.length > 0 ? video.tags.join(", ") : ""}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderBrowsePagination = (browseRoute: BrowseRoute) => {
    let ellipsisCount = 0;

    return (
      <nav aria-label="Catalog pagination" className="pagination">
        <button
          type="button"
          className="pagination-nav"
          onClick={() =>
            navigate(
              toBrowsePath(
                Math.max(1, browseRoute.page - 1),
                browseRoute.pageSize,
                browseRoute.q,
                browseRoute.tagFilters,
                browseRoute.sort,
              ),
            )
          }
          disabled={browseRoute.page <= 1}
        >
          Previous
        </button>
        {getPaginationItems(browseRoute.page, totalPages).map((item) => {
          if (item === "…") {
            ellipsisCount += 1;
            return (
              <span
                key={`ellipsis-${browseRoute.page}-${ellipsisCount}`}
                className="pagination-ellipsis"
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          return (
            <button
              key={item}
              type="button"
              className={
                  item === browseRoute.page
                  ? "pagination-page pagination-current"
                  : "pagination-page"
              }
              onClick={() =>
                navigate(
                    toBrowsePath(
                      item,
                      browseRoute.pageSize,
                      browseRoute.q,
                      browseRoute.tagFilters,
                      browseRoute.sort,
                    ),
                )
              }
                disabled={item === browseRoute.page}
              aria-label={`Page ${item}`}
                aria-current={item === browseRoute.page ? "page" : undefined}
            >
              {item}
            </button>
          );
        })}
        <button
          type="button"
          className="pagination-nav"
          onClick={() =>
            navigate(
              toBrowsePath(
                Math.min(totalPages, browseRoute.page + 1),
                browseRoute.pageSize,
                browseRoute.q,
                browseRoute.tagFilters,
                browseRoute.sort,
              ),
            )
          }
          disabled={browseRoute.page >= totalPages}
        >
          Next
        </button>
      </nav>
    );
  };

  const renderBrowseContent = (): ReactNode => {
    if (route.kind !== "browse") {
      return null;
    }

    return (
      <section aria-label="Browse videos" className="browse-layout">
        {browseError ? <p role="alert">{browseError}</p> : null}
        {!browse && !browseError ? <p>Loading videos...</p> : null}
        {browse ? (
          <>
            {renderBrowseControls(route)}
            {renderTagFilters(route)}
            {renderBrowseCards(browse)}
            {renderBrowsePagination(route)}
          </>
        ) : null}
      </section>
    );
  };

  const renderWatchContent = (watchRoute: WatchRoute): ReactNode => {
    const knownTags = tagCounts.map((item) => item.tag);
    const availableKnownTags =
      watchVideo === null
        ? knownTags
        : knownTags.filter((tag) => !watchVideo.tags.includes(tag));

    return (
      <section className="watch-layout" aria-label="Watch video">
        <button
          type="button"
          className="back-link"
          onClick={() =>
            navigate(toBrowsePath(1, DEFAULT_PAGE_SIZE, "", [], DEFAULT_SORT_MODE))
          }
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
            >
              <track kind="captions" srcLang="en" label="English" />
            </video>
            <section className="tag-editor" aria-label="Video tags">
              <h2>{tagEditorStatus ?? "Tags"}</h2>
              {tagEditorError ? <p role="alert">{tagEditorError}</p> : null}
              <div className="tag-chip-list">
                {watchVideo.tags.length === 0 ? (
                  <p>No tags assigned.</p>
                ) : (
                  watchVideo.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="tag-chip"
                      onClick={() =>
                        void saveWatchTags(
                          watchVideo.tags.filter(
                            (existingTag) => existingTag !== tag,
                          ),
                        )
                      }
                      disabled={isSavingTags}
                      aria-label={`Remove tag ${tag}`}
                    >
                      {tag}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))
                )}
              </div>
              <div className="tag-editor-forms">
                <div className="tag-editor-form">
                  <label htmlFor="known-video-tag-select" className="sr-only">
                    Add existing tag
                  </label>
                  <select
                    id="known-video-tag-select"
                    value={selectedKnownTag}
                    onChange={(event) => {
                      const nextTag = event.target.value;
                      setSelectedKnownTag(nextTag);
                      if (nextTag.length === 0) {
                        return;
                      }
                      void saveWatchTags([...watchVideo.tags, nextTag]);
                    }}
                    disabled={isSavingTags || availableKnownTags.length === 0}
                  >
                    <option value="">Add existing tag</option>
                    {availableKnownTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <form
                  className="tag-editor-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (tagDraft.trim().length === 0) {
                      return;
                    }
                    void saveWatchTags([...watchVideo.tags, tagDraft]);
                  }}
                >
                  <label htmlFor="video-tag-input" className="sr-only">
                    Add tag
                  </label>
                  <input
                    id="video-tag-input"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="Add a new tag"
                  />
                  <button type="submit" disabled={isSavingTags}>
                    Add tag
                  </button>
                </form>
              </div>
            </section>
          </>
        )}
      </section>
    );
  };

  const renderAdminContent = (_adminRoute: AdminRoute): ReactNode => {
    return (
      <section className="admin-layout" aria-label="Admin">
        <h1>Admin</h1>
        <p>Manage the local video index.</p>
        <button
          type="button"
          className="admin-rescan"
          onClick={() => void triggerRescan()}
          disabled={isRescanning}
        >
          {isRescanning ? "Rescanning..." : "Rescan Library"}
        </button>
        {rescanStatus ? <output aria-live="polite">{rescanStatus}</output> : null}
        <section aria-label="Roots and videos per root" className="admin-root-summary">
          <h2>Roots and videos per root</h2>
          {getRootSummaryContent()}
        </section>
        <section aria-label="Tags and videos per tag" className="admin-tag-summary">
          <h2>Tags and videos per tag</h2>
          {getTagSummaryContent()}
        </section>
      </section>
    );
  };

  const renderMainContent = (): ReactNode => {
    if (route.kind === "browse") {
      return renderBrowseContent();
    }

    if (route.kind === "watch") {
      return renderWatchContent(route);
    }

    return renderAdminContent(route);
  };

  const loadRootCounts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingRootCounts(true);
    setRootCountsError(null);

    try {
      const response = await fetch(
        "/api/index/roots",
        signal ? { method: "GET", signal } : { method: "GET" },
      );
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        let detail = "";

        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          detail = payload.error ?? "";
        } else {
          detail = (await response.text()).trim();
        }

        const suffix = detail.length > 0 ? `: ${detail}` : "";
        throw new Error(
          `Could not load roots and video counts (HTTP ${response.status})${suffix}`,
        );
      }

      const data = (await response.json()) as RootVideoCountResponse;
      setRootCounts(data.items);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return;
      }

      setRootCountsError(
        error instanceof Error
          ? error.message
          : "Could not load roots and video counts.",
      );
    } finally {
      setIsLoadingRootCounts(false);
    }
  }, []);

  const loadTagCounts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingTagCounts(true);
    setTagCountsError(null);

    try {
      const response = await fetch(
        "/api/index/tags",
        signal ? { method: "GET", signal } : { method: "GET" },
      );
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        let detail = "";

        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          detail = payload.error ?? "";
        } else {
          detail = (await response.text()).trim();
        }

        const suffix = detail.length > 0 ? `: ${detail}` : "";
        throw new Error(
          `Could not load tags and video counts (HTTP ${response.status})${suffix}`,
        );
      }

      const data = (await response.json()) as TagCountResponse;
      setTagCounts(data.items);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return;
      }

      setTagCountsError(
        error instanceof Error ? error.message : "Could not load tag counts.",
      );
    } finally {
      setIsLoadingTagCounts(false);
    }
  }, []);

  useEffect(() => {
    if (route.kind !== "admin") {
      return;
    }

    const controller = new AbortController();
    void loadRootCounts(controller.signal);
    void loadTagCounts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [route.kind, loadRootCounts, loadTagCounts]);

  useEffect(() => {
    if (route.kind !== "browse") {
      return;
    }

    const controller = new AbortController();
    void loadTagCounts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [route.kind, loadTagCounts]);

  useEffect(() => {
    if (route.kind !== "watch") {
      return;
    }

    const controller = new AbortController();
    void loadTagCounts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [route.kind, loadTagCounts]);

  const triggerRescan = async () => {
    setIsRescanning(true);
    setRescanStatus(null);

    try {
      const response = await fetch("/api/index/rescan", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to rescan index");
      }

      const result = (await response.json()) as {
        inserted: number;
        updated: number;
        deleted: number;
      };
      await loadRootCounts();
      setRescanStatus(
        `Rescan complete: ${result.inserted} inserted, ${result.updated} updated, ${result.deleted} deleted.`,
      );
    } catch {
      setRescanStatus("Rescan failed. Check backend logs and try again.");
    } finally {
      setIsRescanning(false);
    }
  };

  const changeSortMode = (nextSort: CatalogSortMode) => {
    if (route.kind !== "browse") {
      return;
    }

    navigate(toBrowsePath(1, route.pageSize, searchInput.trim(), route.tagFilters, nextSort));
  };

  const changePageSize = (nextPageSize: number) => {
    if (route.kind !== "browse") {
      return;
    }

    const sanitizedPageSize = readPositiveNumber(
      Number.isFinite(nextPageSize) ? String(nextPageSize) : null,
      route.pageSize,
    );
    writeStoredPageSize(sanitizedPageSize);
    navigate(
      toBrowsePath(
        1,
        sanitizedPageSize,
        searchInput.trim(),
        route.tagFilters,
        route.sort,
      ),
    );
  };

  const toggleTagFilter = (tag: string) => {
    if (route.kind !== "browse") {
      return;
    }

    const nextTagFilters = route.tagFilters.includes(tag)
      ? route.tagFilters.filter((existingTag) => existingTag !== tag)
      : [...route.tagFilters, tag];
    const sortedTagFilters = sortStringsAlphabetically(nextTagFilters);
    navigate(
      toBrowsePath(
        1,
        route.pageSize,
        searchInput.trim(),
        sortedTagFilters,
        route.sort,
      ),
    );
  };

  const saveWatchTags = async (nextTags: string[]) => {
    if (route.kind !== "watch" || !watchVideo) {
      return;
    }

    const normalizedTags = Array.from(
      new Set(
        nextTags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    const sortedNormalizedTags = sortStringsAlphabetically(normalizedTags);

    setIsSavingTags(true);
    setTagEditorError(null);
    setTagEditorStatus(null);

    try {
      const response = await fetch(`/api/videos/${watchVideo.id}/tags`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: sortedNormalizedTags }),
      });

      if (!response.ok) {
        throw new Error("Unable to update tags");
      }

      const payload = (await response.json()) as {
        videoId: string;
        tags: string[];
      };

      setWatchVideo((current) =>
        current?.id === payload.videoId
          ? { ...current, tags: normalizeVideoTags(payload.tags) }
          : current,
      );
      setTagDraft("");
      setSelectedKnownTag("");
      setTagEditorStatus("Tags saved.");
      await loadTagCounts();
    } catch {
      setTagEditorError("Could not save tags.");
    } finally {
      setIsSavingTags(false);
    }
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
    <div className={`app-shell${route.kind === "watch" ? " app-shell--watch" : ""}`}>
      <header className="top-bar">
        <button
          className="brand"
          type="button"
          onClick={() =>
            navigate(toBrowsePath(1, DEFAULT_PAGE_SIZE, "", [], DEFAULT_SORT_MODE))
          }
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
            placeholder="Search video names"
            aria-label="Search videos"
          />
          <button type="submit">Search</button>
        </form>
        <button
          type="button"
          className="admin-link"
          onClick={() => navigate("/admin")}
        >
          Admin
        </button>
      </header>

      <main>{renderMainContent()}</main>
    </div>
  );
};

export default App;
