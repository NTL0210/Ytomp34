import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { Modal } from './Modal';

export const Donation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost h-8 px-2.5"
        aria-label="Support Ytomp34"
        title="Support Ytomp34"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Heart className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Support</span>
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Support Ytomp34"
        description="Scan the Vietcombank QR code to donate."
        icon={<Heart className="h-4 w-4 text-muted" aria-hidden="true" />}
        size="sm"
      >
        <div className="text-center">
          <img
            src="./donation.jpg"
            alt="Vietcombank donation QR code"
            className="mx-auto w-full max-w-[260px] rounded-md border border-border"
            loading="lazy"
          />
          <p className="mt-4 text-[12px] leading-5 text-muted">
            Thank you for supporting the continued development of Ytomp34.
          </p>
        </div>
      </Modal>
    </>
  );
};
