import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

type MockResponseInit = {
  status?: number;
};

const jsonResponse = (value: unknown, init: MockResponseInit = {}) => {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json'
    }
  });
};

describe('phase 4 frontend integration', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('browse grid renders paged videos', async () => {
    window.history.pushState({}, '', '/?page=2&pageSize=2');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/videos?')) {
        return jsonResponse({
          page: 2,
          pageSize: 2,
          total: 4,
          items: [
            {
              id: 'video-3',
              title: 'Third Video',
              path: 'third.mp4',
              sizeBytes: 300,
              mtimeMs: 3,
              durationSeconds: null,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            },
            {
              id: 'video-4',
              title: 'Fourth Video',
              path: 'fourth.mp4',
              sizeBytes: 400,
              mtimeMs: 4,
              durationSeconds: null,
              width: null,
              height: null,
              codecName: null,
              formatName: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        });
      }

      return jsonResponse({ error: 'Unexpected request' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Third Video' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fourth Video' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/videos?page=2&pageSize=2&q=', expect.anything());
  });

  it('search param reflected in URL and query call', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/videos?')) {
        return jsonResponse({ page: 1, pageSize: 12, total: 0, items: [] });
      }

      return jsonResponse({ error: 'Unexpected request' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const searchInput = await screen.findByRole('searchbox', { name: 'Search videos' });
    fireEvent.change(searchInput, { target: { value: 'cats' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Video search' }));

    await waitFor(() => {
      expect(window.location.search).toContain('q=cats');
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/videos?page=1&pageSize=12&q=cats', expect.anything());
  });

  it('watch page loads stream URL', async () => {
    window.history.pushState({}, '', '/watch/video-1');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/videos/video-1')) {
        return jsonResponse({
          id: 'video-1',
          title: 'Watch Me',
          path: 'watch-me.mp4',
          sizeBytes: 123,
          mtimeMs: 100,
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          codecName: 'h264',
          formatName: 'mp4',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        });
      }
      if (url.endsWith('/api/videos/video-1/resume')) {
        return jsonResponse({ videoId: 'video-1', positionSeconds: 12, updatedAt: null });
      }

      return jsonResponse({ error: 'Unexpected request' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const video = await screen.findByLabelText('Video player');
    expect(video).toHaveAttribute('src', '/api/videos/video-1/stream');
  });

  it('resume posted on playback updates', async () => {
    window.history.pushState({}, '', '/watch/video-7');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/videos/video-7') && (!init || init.method === undefined)) {
        return jsonResponse({
          id: 'video-7',
          title: 'Resume Me',
          path: 'resume.mp4',
          sizeBytes: 777,
          mtimeMs: 100,
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          codecName: 'h264',
          formatName: 'mp4',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        });
      }
      if (url.endsWith('/api/videos/video-7/resume') && (!init || init.method === undefined)) {
        return jsonResponse({ videoId: 'video-7', positionSeconds: 0, updatedAt: null });
      }
      if (url.endsWith('/api/videos/video-7/resume') && init?.method === 'PUT') {
        return jsonResponse({ videoId: 'video-7', positionSeconds: 33, updatedAt: null });
      }

      return jsonResponse({ error: 'Unexpected request' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const video = (await screen.findByLabelText('Video player')) as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      value: 33,
      configurable: true
    });

    fireEvent.timeUpdate(video);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/videos/video-7/resume',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ positionSeconds: 33 })
        })
      );
    });
  });
});
