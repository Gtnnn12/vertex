import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BoardWidget, User } from '@vertex/shared';

// Spotify block chain pulls the audio stack — stub it for jsdom.
vi.mock('../../spotify/SpotifyVinylBlock', () => ({
  SpotifyVinylBlock: () => <div data-testid="spotify-block" />,
}));
vi.mock('../../../stores/spaceStore', () => ({
  useSpaceStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({}),
    { getState: () => ({}), getApiForOrigin: () => ({ users: { saveBoard: vi.fn() } }), resolveUserOrigin: () => 'local' },
  ),
}));
vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: vi.fn(), setNetrexPurchaseOpen: vi.fn() }),
}));
// Mutable so individual tests can change the logged-in user's entitlement.
const authState: { user: User } = { user: null as unknown as User };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => selector(authState),
}));

import { WIDGET_REGISTRY, WIDGET_CATALOG } from './widgetRegistry';
import { ProfileBoardTab } from './ProfileBoardTab';

const SELF: User = {
  id: 'me-1', username: 'me', displayName: 'Me', avatar: null, banner: null,
  accentColor: null, avatarColor: null, bio: null, status: 'online',
  customStatus: null, isAdmin: false, createdAt: 0, homeInstance: null,
  homeUserId: null, replicatedInstances: [], netrexEnabled: true,
};
authState.user = SELF;

const OTHER: User = { ...SELF, id: 'other-1', username: 'other', netrexEnabled: true };

function widget(id: string, type: BoardWidget['type'], config: Record<string, unknown> = {}): BoardWidget {
  return { id, type, visible: true, config };
}

describe('WIDGET_REGISTRY — data-driven invariant', () => {
  it('has exactly one entry per type, and the catalog matches', () => {
    const types = Object.keys(WIDGET_REGISTRY);
    expect(types).toHaveLength(10);
    expect(WIDGET_CATALOG.map((d) => d.type)).toEqual(types);
    for (const def of WIDGET_CATALOG) {
      expect(def.labelKey).toBeTruthy();
      expect(def.descKey).toBeTruthy();
      expect(typeof def.defaultConfig).toBe('function');
      expect(def.Renderer).toBeTruthy();
    }
  });

  it('renders each widget type through its registry renderer without crashing', () => {
    const samples: Record<string, Record<string, unknown>> = {
      'favorite-game': { title: 'Hollow Knight', description: 'Una obra maestra' },
      'now-song': {},
      quote: { text: 'Sé tu mismo', author: 'Yo' },
      mood: { text: 'Productivo', emoji: '⚡', color: '#57f287' },
      'social-links': { links: [{ label: 'Web', url: 'https://example.com' }] },
      badges: { badges: ['netrex'] },
      goal: { title: 'Leer 12 libros', progress: 42 },
      'friend-spotlight': { name: 'Ada', message: 'La mejor' },
      'top-games': { games: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
      wishlist: { items: ['Consola', 'Monitor'] },
    };
    for (const def of WIDGET_CATALOG) {
      const { unmount } = render(
        <def.Renderer config={samples[def.type] ?? {}} lookupUserId="me-1" isSelf />,
      );
      unmount();
    }
  });
});

describe('ProfileBoardTab — visibility rules', () => {
  it('visitor sees another Netrex user board NORMAL (no locked state)', () => {
    authState.user = OTHER; // someone else viewing
    const user = { ...OTHER, profileBoard: [widget('q', 'quote', { text: 'showcase' })] };
    render(<ProfileBoardTab user={user} origin="local" />);
    expect(screen.getByText(/showcase/)).toBeTruthy();
    expect(document.querySelector('.board-locked')).toBeNull();
  });

  it('own profile with Netrex shows the edit button', () => {
    authState.user = SELF;
    const user = { ...SELF, profileBoard: [widget('q', 'quote', { text: 'mine' })] };
    render(<ProfileBoardTab user={user} origin="local" />);
    expect(screen.getByText(/mine/)).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('own profile WITHOUT Netrex shows the locked CTA instead of the board', () => {
    authState.user = { ...SELF, netrexEnabled: false };
    const user = { ...SELF, netrexEnabled: false, profileBoard: [widget('q', 'quote', { text: 'hidden' })] };
    render(<ProfileBoardTab user={user} origin="local" />);
    // The CTA is rendered with translated text; check the locked wrapper exists and content is NOT shown.
    const wrapper = document.querySelector('.board-locked');
    expect(wrapper).toBeTruthy();
    expect(screen.queryByText('hidden')).toBeNull();
  });

  it('renders widgets in the stored order via the single grid', () => {
    authState.user = OTHER; // visitor

    const user = {
      ...OTHER,
      profileBoard: [
        widget('q', 'quote', { text: 'first' }),
        widget('m', 'mood', { text: 'second' }),
      ],
    };
    const { container } = render(<ProfileBoardTab user={user} origin="local" />);
    const grid = container.querySelector('.board-grid');
    expect(grid?.children.length).toBe(2);
  });
});
