'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/componets/ui/alert-dialog';
import { Button, type ButtonProps } from '@/componets/ui/button';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';

import { useMessages } from '@/lib/i18n/client';

import adminMessages from '../_messages';
import { useErrorText } from './use-api';

interface ConfirmActionProps {
  /** Content of the trigger button */
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  triggerClassName?: string;
  disabled?: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Show an optional note textarea */
  withNote?: boolean;
  noteLabel?: string;
  noteRequired?: boolean;
  noteMaxLength?: number;
  /** Extra content inside the dialog (e.g. a checkbox) */
  children?: React.ReactNode;
  /** Called when the dialog opens/closes (reset extra state) */
  onOpenChange?: (open: boolean) => void;
  /** Throw to keep the dialog open; the error message is shown inside the dialog. */
  onConfirm: (note: string) => Promise<void>;
}

/** Trigger button + AlertDialog with optional note. Prevents double submit. */
export function ConfirmAction({
  trigger,
  triggerVariant = 'outline',
  triggerSize = 'default',
  triggerClassName,
  disabled,
  title,
  description,
  confirmLabel,
  destructive,
  withNote,
  noteLabel,
  noteRequired,
  noteMaxLength = 500,
  children,
  onOpenChange,
  onConfirm,
}: ConfirmActionProps) {
  const t = useMessages(adminMessages);
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setNote('');
      setError(null);
    }
  };

  const submit = async () => {
    if (noteRequired && note.trim().length === 0) {
      setError(t.ui.noteRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      setOpen(false);
      onOpenChange?.(false);
      setNote('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          disabled={disabled}
        >
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {withNote && (
          <div className="space-y-2">
            <Label htmlFor={noteId}>{noteLabel ?? t.ui.noteOptional}</Label>
            <Textarea
              id={noteId}
              value={note}
              maxLength={noteMaxLength}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              disabled={pending}
            />
            <p className="text-right text-xs text-muted-grey">
              {note.length}/{noteMaxLength}
            </p>
          </div>
        )}

        {children}

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.ui.cancel}</AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={submit}
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
