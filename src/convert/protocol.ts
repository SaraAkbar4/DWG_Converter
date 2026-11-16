import type { CadDrawing } from '../cad/types';

export type Stage = 'reading' | 'parsing' | 'building' | 'rendering';
export type Sheet = { name: string; drawing: CadDrawing };
export type FileInfo = { name: string; size: number; format: 'DWG' | 'DXF' | 'PDF'; version: string | null };
export type FailureCode = 'unsupported' | 'corrupt' | 'empty' | 'too_large' | 'crashed';

export type WorkerRequest = { name: string; buffer: ArrayBuffer };
export type WorkerMessage =
  | { type: 'stage'; stage: Stage }
  | { type: 'done'; sheets: Sheet[]; info: FileInfo }
  | { type: 'error'; code: FailureCode; message: string };
