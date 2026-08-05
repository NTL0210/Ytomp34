import React, { useEffect, useRef, useState } from 'react';
import { Heart, X } from 'lucide-react';

export const Donation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
        aria-label="Support Ytomp34"
        title="Support Ytomp34"
      >
        <Heart className="w-5 h-5" />
        <span className="hidden sm:inline font-medium">Donate</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-title"
            className="relative w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-800"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h2 id="donation-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Support Ytomp34
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                aria-label="Close donation dialog"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 text-center">
              <img
                src="./donation.jpg"
                alt="Vietcombank donation QR code"
                className="mx-auto w-full max-w-xs rounded-lg border border-gray-200 dark:border-gray-700"
              />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Thank you for supporting the continued development of Ytomp34.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
