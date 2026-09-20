import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Stub AudioManager to avoid AudioWorkletNode reference error in jsdom.
// Reached transitively via spaceStore → chatStore → useWebSocket → voiceStore.
vi.mock('../../audio/AudioManager', () => ({
  AudioManager: {
    getInstance: vi.fn().mockReturnValue({
      setOutputDevice: vi.fn(),
      setVolume: vi.fn(),
    }),
  },
}));

import { JoinSpaceModal } from './JoinSpace';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useExploreStore } from '../../stores/exploreStore';
import { LanguageProvider } from '../../contexts/LanguageContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  useUIStore.setState({ activeModal: null });
  useSpaceStore.setState({
    spaces: [],
    currentSpaceId: null,
  });
  useExploreStore.setState({
    spaces: [],
    myRequests: [],
    isLoading: false,
    discoveryEnabled: true,
    error: null,
    fetchSpaces: vi.fn().mockResolvedValue(undefined),
    fetchMyRequests: vi.fn().mockResolvedValue(undefined),
    publicJoin: vi.fn().mockResolvedValue({ id: 'p1', name: 'Preview Space' }),
    requestJoin: vi.fn().mockResolvedValue({ id: 'r1', spaceId: 'p1', status: 'pending' }),
  });
  useUIStore.setState({ isMobile: false });
});

function renderModal() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <JoinSpaceModal />
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('JoinSpaceModal', () => {
  it('does not render when activeModal is not "joinSpace"', () => {
    useUIStore.setState({ activeModal: null });
    renderModal();
    expect(screen.queryByText('Join a Space')).not.toBeInTheDocument();
  });

  it('renders the form when opened', () => {
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    expect(screen.getByText(/Unirse a un espacio/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/abc123 o https:\/\/instancia\.com\/join\/abc123/)
    ).toBeInTheDocument();
    expect(screen.getByText('Unirse al espacio')).toBeInTheDocument();
  });

  it('disables the Join Space button while the input is empty', () => {
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();

    // The submit button is the validation gate in this UI — there is no
    // click-to-show-error path. parseInviteInput's 'Invite code is required'
    // branch is defensive only and unreachable from the rendered form.
    expect(screen.getByText('Unirse al espacio')).toBeDisabled();
  });

  it('calls joinByCode with the entered invite code and navigates on success', async () => {
    const user = userEvent.setup();
    const mockJoinByCode = vi.fn().mockResolvedValue({ id: 'new-space-id', name: 'Test Space' });
    useUIStore.setState({ activeModal: 'joinSpace' });
    useSpaceStore.setState({ joinByCode: mockJoinByCode });

    renderModal();

    // Type invite code
    const input = screen.getByPlaceholderText(/abc123 o https:\/\/instancia\.com\/join\/abc123/);
    await user.type(input, 'my-invite-code');

    // Click join
    const submitButton = screen.getByText('Unirse al espacio');
    await user.click(submitButton);

    // joinByCode(code, origin) — bare code has no origin, so second arg is
    // undefined (parseInviteInput returns { code, origin: undefined }).
    await waitFor(() => {
      expect(mockJoinByCode).toHaveBeenCalledWith('my-invite-code', undefined);
    });

    // Should navigate to the new space
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/channels/new-space-id');
    });

    // Modal should close (activeModal becomes null)
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('shows error message when joinByCode fails', async () => {
    const user = userEvent.setup();
    const mockJoinByCode = vi.fn().mockRejectedValue(new Error('Invalid invite code'));
    useUIStore.setState({ activeModal: 'joinSpace' });
    useSpaceStore.setState({ joinByCode: mockJoinByCode });

    renderModal();

    const input = screen.getByPlaceholderText(/abc123 o https:\/\/instancia\.com\/join\/abc123/);
    await user.type(input, 'bad-code');

    const submitButton = screen.getByText('Unirse al espacio');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid invite code')).toBeInTheDocument();
    });
  });

  it('shows the discovery heading and fetches spaces on open', () => {
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    expect(screen.getByText(/Descubre spaces a los que unirte/i)).toBeInTheDocument();
    expect(useExploreStore.getState().fetchSpaces).toHaveBeenCalled();
    expect(screen.getByText('Explorar todos')).toBeInTheDocument();
  });

  it('renders live preview cards for unjoined discoverable spaces', () => {
    useExploreStore.setState({
      spaces: [{
        id: 'p1', name: 'Preview Space', icon: null, banner: null, avatarColor: null,
        description: null, visibility: 'public', memberCount: 4, createdAt: 0,
        joined: false, _instanceOrigin: '',
      }],
    });
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    expect(screen.getByText('Preview Space')).toBeInTheDocument();
  });

  it('Browse all navigates to /explore on desktop and closes the modal', async () => {
    const user = userEvent.setup();
    useUIStore.setState({ activeModal: 'joinSpace', isMobile: false });
    renderModal();
    await user.click(screen.getByText('Explorar todos'));
    expect(mockNavigate).toHaveBeenCalledWith('/explore');
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('Browse all uses the mobile screen stack when on mobile', async () => {
    const user = userEvent.setup();
    const pushMobileScreen = vi.fn();
    useUIStore.setState({ activeModal: 'joinSpace', isMobile: true, pushMobileScreen });
    renderModal();
    await user.click(screen.getByText('Explorar todos'));
    expect(pushMobileScreen).toHaveBeenCalledWith('explore');
    expect(mockNavigate).not.toHaveBeenCalledWith('/explore');
  });

  it('shows loading skeletons while discovery is fetching with no spaces yet', () => {
    useExploreStore.setState({ isLoading: true, spaces: [] });
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    // The skeleton branch (discoveryLoading && previewSpaces.length === 0)
    // renders placeholder rows marked with `animate-pulse`.
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('degrades to the invite path when discovery fails to load', () => {
    useExploreStore.setState({ error: 'boom', spaces: [], isLoading: false });
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    // Discovery failure shows a degrade note...
    expect(screen.getByText(/No se pudo cargar los spaces/i)).toBeInTheDocument();
    // The invite input stays usable so the user can still join.
    expect(
      screen.getByPlaceholderText(/abc123 o https:\/\/instancia\.com\/join\/abc123/)
    ).toBeInTheDocument();
  });

  it('hides discovery and shows a notice when discovery is disabled', () => {
    useExploreStore.setState({ discoveryEnabled: false });
    useUIStore.setState({ activeModal: 'joinSpace' });
    renderModal();
    expect(screen.getByText(/descubrimiento de spaces está desactivado/i)).toBeInTheDocument();
    expect(screen.queryByText('Explorar todos')).not.toBeInTheDocument();
    // invite path still available
    expect(screen.getByPlaceholderText(/abc123 o https:\/\/instancia\.com\/join\/abc123/)).toBeInTheDocument();
  });
});
