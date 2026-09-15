import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';

interface ReleaseNotes {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
}

interface UpdateNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  onInstall: () => void;
}

/**
 * Discord-style update notes modal.
 * Fetches release notes from GitHub and renders them with formatted sections.
 */
export function UpdateNotesModal({ isOpen, onClose, version, onInstall }: UpdateNotesModalProps) {
  const [notes, setNotes] = useState<ReleaseNotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !version) return;

    setLoading(true);
    setError(null);

    // Fetch release notes from GitHub API
    fetch(`https://api.github.com/repos/gtnn12/VERTEX/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Release not found');
        return res.json();
      })
      .then((data: ReleaseNotes) => {
        setNotes(data);
        setLoading(false);
      })
      .catch(() => {
        // Try fetching the latest release instead
        fetch('https://api.github.com/repos/gtnn12/VERTEX/releases/latest', {
          headers: { Accept: 'application/vnd.github.v3+json' },
        })
          .then((res) => {
            if (!res.ok) throw new Error('No releases found');
            return res.json();
          })
          .then((data: ReleaseNotes) => {
            setNotes(data);
            setLoading(false);
          })
          .catch(() => {
            setError('Could not load release notes');
            setLoading(false);
          });
      });
  }, [isOpen, version]);

  // Parse markdown-like formatting (simplified Discord style)
  const formatBody = (body: string): string => {
    return body
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-txt-primary mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-txt-primary mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-txt-primary mt-6 mb-3">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-txt-primary">$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em class="italic text-txt-secondary">$1</em>')
      // Code blocks
      .replace(/`([^`]+)`/g, '<code class="bg-surface-elevated px-1.5 py-0.5 rounded text-accent-primary text-sm">$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent-primary hover:underline">$1</a>')
      // Bullet lists
      .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 ml-4"><span class="text-accent-primary mt-0.5">•</span><span>$1</span></li>')
      // Numbered lists
      .replace(/^(\d+)\. (.+)$/gm, '<li class="flex items-start gap-2 ml-4"><span class="text-accent-primary font-medium">$1.</span><span>$2</span></li>')
      // Emojis (keep as-is, Discord style)
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="What's New" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Version badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary/20 rounded-full">
            <div className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
            <span className="text-sm font-medium text-accent-primary">v{version}</span>
          </div>
          {notes?.published_at && (
            <span className="text-xs text-txt-tertiary">
              {new Date(notes.published_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Release notes content */}
        <div className="bg-surface-base rounded-xl p-4 max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-txt-tertiary text-sm">{error}</p>
              <p className="text-txt-tertiary text-xs mt-2">
                Check{' '}
                <a
                  href="https://github.com/gtnn12/VERTEX/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  GitHub Releases
                </a>{' '}
                for details
              </p>
            </div>
          )}

          {notes && !loading && (
            <div>
              {notes.name && (
                <h2 className="text-xl font-bold text-txt-primary mb-3">{notes.name}</h2>
              )}
              <div
                className="text-sm text-txt-secondary leading-relaxed space-y-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-txt-primary [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-txt-primary [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-txt-primary [&_strong]:font-bold [&_strong]:text-txt-primary [&_em]:italic [&_em]:text-txt-secondary [&_code]:bg-surface-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent-primary [&_code]:text-sm [&_a]:text-accent-primary [&_a]:hover:underline [&_li]:flex [&_li]:items-start [&_li]:gap-2 [&_li]:ml-4"
                dangerouslySetInnerHTML={{ __html: formatBody(notes.body) }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              window.open('https://github.com/gtnn12/VERTEX/releases/latest', '_blank');
            }}
            className="text-sm text-txt-tertiary hover:text-txt-secondary transition-colors"
          >
            View on GitHub
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-txt-tertiary hover:text-txt-secondary transition-colors"
            >
              Later
            </button>
            <button
              onClick={onInstall}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Restart & Install
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
