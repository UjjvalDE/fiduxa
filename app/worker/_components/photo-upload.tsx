'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { Button } from '@/componets/ui/button';
import { api } from '@/lib/api';
import { useMessages } from '@/lib/i18n/client';
import { useErrorText } from '@/app/admin/_components/use-api';

import portalMessages from '../_portal-messages';

const MAX_SIDE = 512;
const MAX_BYTES = 400 * 1024;

class PhotoError extends Error {
  constructor(public code: 'read' | 'size') {
    super(code);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError('read'));
    };
    img.src = url;
  });
}

/** Centre-crop to a square, scale to max. 512×512 and encode as JPEG under 400 KB */
async function resizePhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new PhotoError('read');
  const target = Math.min(MAX_SIDE, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('read');
  ctx.fillStyle = '#ffffff'; // transparent PNGs → white background
  ctx.fillRect(0, 0, target, target);
  ctx.imageSmoothingQuality = 'high';
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes <= MAX_BYTES) return dataUrl;
  }
  throw new PhotoError('size');
}

export function PhotoUpload({
  name,
  avatarUrl,
  editable,
  onChange,
}: {
  name: string;
  avatarUrl: string | null;
  editable: boolean;
  onChange: (avatarUrl: string | null) => void;
}) {
  const t = useMessages(portalMessages).profilePage;
  const errorText = useErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError(t.errNotImage);
      return;
    }
    setBusy('upload');
    try {
      const image = await resizePhoto(file);
      const res = await api.put<{ avatarUrl: string | null }>('/worker/avatar', { image });
      onChange(res.avatarUrl);
      toast.success(t.photoSaved);
    } catch (err) {
      setError(err instanceof PhotoError ? (err.code === 'size' ? t.errTooLarge : t.errRead) : errorText(err));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError(null);
    setBusy('remove');
    try {
      await api.delete('/worker/avatar');
      onChange(null);
      toast.success(t.photoRemoved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <CleanerAvatar name={name} src={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-muted-grey">{t.photoHint}</p>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <Button type="button" className="h-11" disabled={busy !== null} onClick={() => inputRef.current?.click()}>
              {busy === 'upload' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {busy === 'upload' ? t.photoProcessing : avatarUrl ? t.changePhoto : t.choosePhoto}
            </Button>
            {avatarUrl && (
              <Button type="button" variant="outline" className="h-11" disabled={busy !== null} onClick={remove}>
                {busy === 'remove' ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="mr-2 h-5 w-5" aria-hidden="true" />
                )}
                {t.removePhoto}
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
