import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from '@/components/Modal';

const Harness = () => {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('');

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Room poll">
      <input
        aria-label="Question"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Modal>
  );
};

afterEach(cleanup);

describe('Modal', () => {
  it('keeps an input focused while typing and closes with the latest handler', () => {
    render(<Harness />);

    const input = screen.getByRole('textbox', { name: 'Question' });
    input.focus();
    fireEvent.change(input, { target: { value: 'Which song next?' } });

    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Which song next?');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
